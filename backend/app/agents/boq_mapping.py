"""Ask Ollama to map each invoice line to a BoQ line (or null).

The prompt is tight because small open-weights models drift when freeform. We
return a defensively-parsed dict; callers should treat null confidently.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.orm import Session

from app.services.ollama_client import generate_json

log = logging.getLogger(__name__)


SYSTEM = """You map vendor-invoice line items to Bill of Quantity (BoQ) line items for a construction contract.
Rules:
- Output VALID JSON only, no prose, no markdown fences.
- For each invoice line produce exactly ONE result row keyed by its `invoice_line_number`.
- If no BoQ line is a reasonable match, set `boq_line_number` to null and `confidence` to a low value (<30).
- Match on intent (what work or material is being billed), not literal word overlap. Unit-of-measure compatibility is a strong signal; wildly-different UoMs argue against a match.
- Confidence is 0–100 and should reflect how certain you are the two lines refer to the same work item.
"""


@dataclass
class MappingSuggestion:
    invoice_line_number: int
    boq_line_number: int | None
    confidence: int
    reason: str = ""


def _format_invoice_lines(lines: list[dict]) -> str:
    out: list[str] = []
    for line in lines:
        out.append(
            f"- invoice_line_number={line['line_number']} | desc={line['description']!r} | uom={line.get('uom')!r} | qty={line.get('quantity')} | unit_price={line.get('unit_price')}"
        )
    return "\n".join(out)


def _format_boq_lines(items: list[dict]) -> str:
    out: list[str] = []
    for it in items:
        out.append(
            f"- boq_line_number={it['line_number']} | desc={it['description']!r} | uom={it.get('uom')!r} | qty={it.get('quantity')} | unit_price={it.get('unit_price')}"
        )
    return "\n".join(out)


def build_prompt(invoice_lines: list[dict], boq_items: list[dict]) -> str:
    return f"""Match these vendor invoice lines to these BoQ lines.

Invoice lines:
{_format_invoice_lines(invoice_lines)}

Available BoQ lines:
{_format_boq_lines(boq_items)}

Return JSON with this shape EXACTLY:
{{
  "mappings": [
    {{ "invoice_line_number": <int>, "boq_line_number": <int|null>, "confidence": <int 0-100>, "reason": "<short phrase>" }}
  ]
}}
One entry per invoice line, in the same order, no duplicates, no extra keys."""


def _parse(raw: str) -> list[MappingSuggestion]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    parsed = json.loads(text)
    out: list[MappingSuggestion] = []
    for row in parsed.get("mappings") or []:
        try:
            ln = int(row.get("invoice_line_number"))
        except (TypeError, ValueError):
            continue
        bl_raw = row.get("boq_line_number")
        try:
            bl = int(bl_raw) if bl_raw is not None else None
        except (TypeError, ValueError):
            bl = None
        try:
            conf = int(row.get("confidence") or 0)
        except (TypeError, ValueError):
            conf = 0
        out.append(
            MappingSuggestion(
                invoice_line_number=ln,
                boq_line_number=bl,
                confidence=max(0, min(100, conf)),
                reason=str(row.get("reason") or "")[:300],
            )
        )
    return out


def propose_mappings(
    db: Session,
    invoice_id: UUID,
    invoice_lines: list[dict],
    boq_items: list[dict],
) -> list[MappingSuggestion]:
    if not invoice_lines or not boq_items:
        return []
    prompt = build_prompt(invoice_lines, boq_items)
    resp = generate_json(
        db,
        agent="boq_mapping",
        system=SYSTEM,
        prompt=prompt,
        invoice_id=invoice_id,
    )
    try:
        return _parse(resp.text)
    except (json.JSONDecodeError, ValueError) as exc:
        log.warning("boq_mapping_parse_failed", extra={"err": str(exc)})
        return []
