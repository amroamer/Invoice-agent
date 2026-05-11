"""Invoice extraction agent.

Takes OCR'd text and returns a structured JSON document with field values plus
per-field confidence scores (0–100). The prompt is deliberately strict about
output shape; the parser is defensive in case the model drifts.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.ollama_client import generate_json

log = logging.getLogger(__name__)


SYSTEM = """You extract invoice data from OCR text into a strict JSON schema.
Rules:
- Output VALID JSON only, no prose, no markdown fences.
- If a field is not present on the invoice, return null for that field — never guess.
- Numbers must be strings in decimal form (no currency symbols, no thousands separators): e.g. "1234.56".
- Dates must be ISO (YYYY-MM-DD).
- Every field must be accompanied by a confidence score 0–100 reflecting how certain the extraction is based on the evidence in the text.
"""

SCHEMA_HINT = """Return JSON with EXACTLY these top-level keys:
{
  "invoice_number": string|null,
  "invoice_date": string|null,
  "vendor_legal_name": string|null,
  "vendor_trn": string|null,
  "buyer_name": string|null,
  "buyer_trn": string|null,
  "currency": string|null,
  "subtotal": string|null,
  "vat_amount": string|null,
  "total": string|null,
  "payment_terms": string|null,
  "bank_details": {"bank": string|null, "iban": string|null, "account": string|null}|null,
  "contract_reference": string|null,
  "po_reference": string|null,
  "project_reference": string|null,
  "line_items": [ {"line_number": integer|null, "description": string, "uom": string|null, "quantity": string, "unit_price": string, "line_total": string} ],
  "confidence": {
    "invoice_number": integer,
    "invoice_date": integer,
    "vendor_legal_name": integer,
    "vendor_trn": integer,
    "buyer_name": integer,
    "buyer_trn": integer,
    "currency": integer,
    "subtotal": integer,
    "vat_amount": integer,
    "total": integer,
    "payment_terms": integer,
    "bank_details": integer,
    "contract_reference": integer,
    "po_reference": integer,
    "project_reference": integer,
    "line_items": integer
  }
}
"""

FIELD_KEYS = (
    "invoice_number",
    "invoice_date",
    "vendor_legal_name",
    "vendor_trn",
    "buyer_name",
    "buyer_trn",
    "currency",
    "subtotal",
    "vat_amount",
    "total",
    "payment_terms",
    "bank_details",
    "contract_reference",
    "po_reference",
    "project_reference",
    "line_items",
)


@dataclass
class ExtractedInvoice:
    fields: dict = field(default_factory=dict)
    confidence: dict = field(default_factory=dict)
    line_items: list[dict] = field(default_factory=list)
    raw_response: str = ""
    model: str = ""


def build_prompt(ocr_text: str) -> str:
    return (
        SCHEMA_HINT
        + "\nInvoice OCR text:\n-----\n"
        + ocr_text.strip()[:16000]
        + "\n-----\n"
        + 'Return ONLY the JSON. Start with "{".'
    )


def _parse_response(raw: str) -> dict:
    text = raw.strip()
    # Tolerate stray fences or leading/trailing prose.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def _normalize(parsed: dict) -> ExtractedInvoice:
    fields = {k: parsed.get(k) for k in FIELD_KEYS}
    confidence_raw = parsed.get("confidence") or {}
    # coerce to ints, clamp 0..100
    confidence: dict[str, int] = {}
    for k in FIELD_KEYS:
        v = confidence_raw.get(k)
        try:
            iv = int(v) if v is not None else 0
        except (TypeError, ValueError):
            iv = 0
        confidence[k] = max(0, min(100, iv))
    line_items_raw = fields.get("line_items") or []
    line_items: list[dict] = []
    for idx, li in enumerate(line_items_raw, start=1):
        if not isinstance(li, dict):
            continue
        line_items.append(
            {
                "line_number": li.get("line_number") or idx,
                "description": str(li.get("description") or "").strip(),
                "uom": (li.get("uom") or "").strip() or None,
                "quantity": str(li.get("quantity") or "0"),
                "unit_price": str(li.get("unit_price") or "0"),
                "line_total": str(li.get("line_total") or "0"),
            }
        )
    fields["line_items"] = line_items
    return ExtractedInvoice(
        fields=fields,
        confidence=confidence,
        line_items=line_items,
    )


def extract(db: Session, ocr_text: str, invoice_id: UUID | None = None) -> ExtractedInvoice:
    if not ocr_text.strip():
        return ExtractedInvoice(
            fields={k: None for k in FIELD_KEYS},
            confidence={k: 0 for k in FIELD_KEYS},
            line_items=[],
        )
    prompt = build_prompt(ocr_text)
    resp = generate_json(
        db,
        agent="invoice_extraction",
        system=SYSTEM,
        prompt=prompt,
        invoice_id=invoice_id,
    )
    try:
        parsed = _parse_response(resp.text)
    except (json.JSONDecodeError, ValueError) as exc:
        log.warning("extraction_parse_failed", extra={"err": str(exc)})
        return ExtractedInvoice(
            fields={k: None for k in FIELD_KEYS},
            confidence={k: 0 for k in FIELD_KEYS},
            line_items=[],
            raw_response=resp.text[:4000],
            model=resp.model,
        )
    result = _normalize(parsed)
    result.raw_response = resp.text[:4000]
    result.model = resp.model
    return result
