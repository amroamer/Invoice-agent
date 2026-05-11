"""LLM-authored justifications and clarification emails.

The deterministic synthesis in app.services.recommendation already produces a
workable scenario draft with template-generated text. This agent asks the model
to produce better prose conditioned on the same structured findings. If the
call fails or returns garbage, the caller falls back to the templated text.
"""
from __future__ import annotations

import json
import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.finding import Finding
from app.models.invoice import Invoice
from app.services.ollama_client import generate_json

log = logging.getLogger(__name__)


SYSTEM = """You write finance-officer-facing justifications for invoice payment decisions.
Rules:
- Output VALID JSON only.
- One key per scenario name that exists in the input ("happy", "conditional", "do_not_pay").
- Every justification is 2–4 short sentences, professional, and references specific findings.
- For the "conditional" scenario also produce a short vendor-facing clarification email.
"""


def _finding_payload(findings: list[Finding]) -> list[dict[str, Any]]:
    return [
        {
            "rule_code": f.rule_code,
            "severity": f.severity.value,
            "message": f.message,
            "reference": f.reference_json or {},
        }
        for f in findings
    ]


def enhance(
    db: Session,
    invoice: Invoice,
    findings: list[Finding],
    scenario_names: list[str],
) -> dict[str, dict[str, str]]:
    if not scenario_names:
        return {}
    payload = {
        "invoice": {
            "invoice_number": invoice.invoice_number,
            "invoice_date": invoice.invoice_date.isoformat(),
            "subtotal": str(invoice.subtotal),
            "vat": str(invoice.vat),
            "total": str(invoice.total),
            "currency": invoice.currency,
        },
        "findings": _finding_payload(findings),
        "scenarios": scenario_names,
    }
    prompt = (
        "Generate a justification paragraph for each listed scenario. "
        "For 'conditional' also write a vendor clarification email.\n\n"
        "Return JSON with this shape:\n"
        '{ "<scenario>": { "justification": "...", "clarification_email": "..." } }\n'
        '(omit "clarification_email" for scenarios other than "conditional")\n\n'
        + json.dumps(payload, default=str)
    )
    try:
        resp = generate_json(
            db,
            agent="recommendation",
            system=SYSTEM,
            prompt=prompt,
            invoice_id=invoice.id,
            temperature=0.2,
        )
    except Exception:  # noqa: BLE001
        log.warning("recommendation_llm_failed")
        return {}
    try:
        parsed = json.loads(resp.text.strip() or "{}")
    except json.JSONDecodeError:
        start = resp.text.find("{")
        end = resp.text.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(resp.text[start : end + 1])
            except json.JSONDecodeError:
                return {}
        else:
            return {}
    out: dict[str, dict[str, str]] = {}
    for k in scenario_names:
        block = parsed.get(k) if isinstance(parsed, dict) else None
        if not isinstance(block, dict):
            continue
        justification = str(block.get("justification") or "").strip()
        email = str(block.get("clarification_email") or "").strip()
        row: dict[str, str] = {}
        if justification:
            row["justification"] = justification
        if email:
            row["clarification_email"] = email
        if row:
            out[k] = row
    return out


def generate_scenario_text(
    db: Session,
    invoice: Invoice,
    findings: list[Finding],
    scenario_names: list[str],
) -> dict[str, dict[str, str]]:
    """Public entrypoint, wraps `enhance` with an explicit contract."""
    return enhance(db, invoice, findings, scenario_names)


UUID_ = UUID  # re-export so the type is reachable without re-importing  # noqa: E305
