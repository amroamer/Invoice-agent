"""Deterministic synthesis of recommendation scenarios from structured findings.

LLM justification is layered on by the caller; this module is pure so the
business logic stays testable without hitting Ollama.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.models.enums import FindingSeverity, Scenario
from app.models.finding import Finding
from app.models.invoice import Invoice
from app.validation.rules import NON_RECOVERABLE_BLOCKERS


@dataclass
class ScenarioDraft:
    scenario: Scenario
    confidence: int
    justification: str
    deduction_amount: Decimal | None = None
    clarification_email: str | None = None
    finding_ids: list[str] = field(default_factory=list)


def _get_suggested_deduction(f: Finding) -> Decimal:
    ref = f.reference_json or {}
    raw = ref.get("suggested_deduction")
    if raw in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(raw))
    except Exception:  # noqa: BLE001
        return Decimal("0")


def _bullet(findings: list[Finding]) -> str:
    return "\n".join(f"{i + 1}. {f.message}" for i, f in enumerate(findings))


def synthesize(invoice: Invoice, findings: list[Finding]) -> list[ScenarioDraft]:
    blockers = [f for f in findings if f.severity == FindingSeverity.blocker]
    warnings = [f for f in findings if f.severity == FindingSeverity.warning]
    non_rec = [f for f in blockers if f.rule_code in NON_RECOVERABLE_BLOCKERS]
    rec = [f for f in blockers if f.rule_code not in NON_RECOVERABLE_BLOCKERS]

    out: list[ScenarioDraft] = []

    # Happy Path — only when completely clean.
    if not blockers and not warnings:
        out.append(
            ScenarioDraft(
                scenario=Scenario.happy,
                confidence=95,
                justification=(
                    f"All seven validation checks passed. The invoice totals reconcile, no duplicate "
                    f"was found, unit prices match the BoQ, cumulative quantities and contract value "
                    f"are within budget, the invoice date is within the contract window, and the "
                    f"vendor identity matches. Recommend paying {invoice.total} {invoice.currency}."
                ),
            )
        )

    # Conditional — warnings or recoverable blockers, and no hard-stop blockers.
    if (warnings or rec) and not non_rec:
        total_ded = sum(
            (_get_suggested_deduction(f) for f in rec + warnings),
            Decimal("0"),
        ).quantize(Decimal("0.01"))
        net = (invoice.total - total_ded).quantize(Decimal("0.01"))

        issue_text = _bullet(rec + warnings)
        clarification = _draft_clarification_email(invoice, rec + warnings)

        confidence = 70 if rec else 85  # more confident when only warnings
        justification_bits = [
            f"The invoice has {len(rec)} recoverable blocker(s) and {len(warnings)} warning(s) that "
            "can be handled without rejecting the invoice outright.",
            "",
            issue_text,
            "",
        ]
        if total_ded > 0:
            justification_bits.append(
                f"Recommended deduction: {total_ded} {invoice.currency}. "
                f"Net payable: {net} {invoice.currency}."
            )
        else:
            justification_bits.append(
                "No deduction is required; clarification from the vendor will close the findings."
            )

        out.append(
            ScenarioDraft(
                scenario=Scenario.conditional,
                confidence=confidence,
                justification="\n".join(justification_bits),
                deduction_amount=total_ded if total_ded > 0 else None,
                clarification_email=clarification,
                finding_ids=[str(f.id) for f in rec + warnings],
            )
        )

    # Do Not Pay — any non-recoverable blocker is a hard stop.
    if non_rec:
        all_issues = non_rec + rec + warnings
        issue_text = _bullet(all_issues)
        out.append(
            ScenarioDraft(
                scenario=Scenario.do_not_pay,
                confidence=95,
                justification=(
                    "Do not pay this invoice. The following issues prevent payment:\n\n"
                    f"{issue_text}"
                ),
                finding_ids=[str(f.id) for f in all_issues],
            )
        )

    return out


def _draft_clarification_email(invoice: Invoice, findings: list[Finding]) -> str:
    body_lines = [
        "Dear Vendor,",
        "",
        f"We are reviewing invoice {invoice.invoice_number} dated {invoice.invoice_date} for a "
        f"total of {invoice.total} {invoice.currency}.",
        "",
        "Before we can approve payment please clarify the following:",
        "",
    ]
    for i, f in enumerate(findings, start=1):
        body_lines.append(f"  {i}. {f.message}")
    body_lines.extend(
        [
            "",
            "Kindly respond with supporting documentation or an amended invoice.",
            "",
            "Regards,",
            "Finance",
        ]
    )
    return "\n".join(body_lines)
