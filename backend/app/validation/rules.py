"""Seven MVP validation rules. Each returns a list of Finding drafts — structured,
ordered, and free of any DB side effects. The runner persists them.

Rule codes are stable strings; the frontend keys its styling off them and the
recommendation engine checks recoverability by code.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.boq_item import BoqItem
from app.models.contract import Contract
from app.models.enums import FindingSeverity
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem

# Rule codes ---------------------------------------------------------------

ARITH_LINE_MISMATCH = "arith_line_mismatch"
ARITH_SUBTOTAL = "arith_subtotal"
ARITH_VAT = "arith_vat"
ARITH_TOTAL = "arith_total"
DUP_EXACT = "dup_exact"
DUP_SOFT = "dup_soft"
UNIT_PRICE_DRIFT = "unit_price_drift"
QTY_BREACH = "qty_breach"
VALUE_BREACH = "value_breach"
DATE_OUT_OF_WINDOW = "date_out_of_window"
VENDOR_MISMATCH = "vendor_mismatch"
BOQ_MAPPING_MISSING = "boq_mapping_missing"

# Blockers that cannot become a Conditional payment — they demand Do Not Pay.
NON_RECOVERABLE_BLOCKERS: set[str] = {
    DUP_EXACT,
    DATE_OUT_OF_WINDOW,
    VENDOR_MISMATCH,
}


@dataclass
class FindingDraft:
    rule_code: str
    severity: FindingSeverity
    message: str
    reference: dict[str, Any] = field(default_factory=dict)
    suggested_deduction: Decimal = Decimal("0")


def _quant(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"))


# Rule 1 — arithmetic ------------------------------------------------------


def check_arithmetic(
    invoice: Invoice,
    *,
    vat_rate: Decimal,
    tolerance: Decimal = Decimal("0.05"),
) -> list[FindingDraft]:
    findings: list[FindingDraft] = []

    # Per-line: line_total ≈ qty × unit_price
    for li in invoice.line_items:
        computed = (li.quantity * li.unit_price).quantize(Decimal("0.01"))
        diff = (li.line_total - computed).copy_abs()
        if diff > tolerance:
            severity = FindingSeverity.warning if diff <= Decimal("5") else FindingSeverity.blocker
            findings.append(
                FindingDraft(
                    rule_code=ARITH_LINE_MISMATCH,
                    severity=severity,
                    message=(
                        f"Line {li.line_number} total {li.line_total} ≠ quantity × unit_price "
                        f"({computed}); diff {diff}."
                    ),
                    reference={"invoice_line_item_id": str(li.id), "line_number": li.line_number},
                    suggested_deduction=max(Decimal("0"), li.line_total - computed),
                )
            )

    sum_lines = sum((li.line_total for li in invoice.line_items), Decimal("0")).quantize(
        Decimal("0.01")
    )
    if (invoice.subtotal - sum_lines).copy_abs() > tolerance:
        findings.append(
            FindingDraft(
                rule_code=ARITH_SUBTOTAL,
                severity=FindingSeverity.blocker,
                message=f"Subtotal {invoice.subtotal} ≠ sum of line totals {sum_lines}.",
                reference={"field": "subtotal"},
                suggested_deduction=max(Decimal("0"), invoice.subtotal - sum_lines),
            )
        )

    expected_vat = (invoice.subtotal * vat_rate).quantize(Decimal("0.01"))
    if (invoice.vat - expected_vat).copy_abs() > tolerance:
        severity = (
            FindingSeverity.blocker
            if (invoice.vat - expected_vat).copy_abs() > Decimal("1.00")
            else FindingSeverity.warning
        )
        findings.append(
            FindingDraft(
                rule_code=ARITH_VAT,
                severity=severity,
                message=(
                    f"VAT {invoice.vat} ≠ subtotal × {vat_rate*100:.0f}% "
                    f"({expected_vat})."
                ),
                reference={"field": "vat", "expected": str(expected_vat)},
                suggested_deduction=max(Decimal("0"), invoice.vat - expected_vat),
            )
        )

    expected_total = (invoice.subtotal + invoice.vat).quantize(Decimal("0.01"))
    if (invoice.total - expected_total).copy_abs() > tolerance:
        findings.append(
            FindingDraft(
                rule_code=ARITH_TOTAL,
                severity=FindingSeverity.blocker,
                message=f"Total {invoice.total} ≠ subtotal + VAT ({expected_total}).",
                reference={"field": "total", "expected": str(expected_total)},
                suggested_deduction=max(Decimal("0"), invoice.total - expected_total),
            )
        )
    return findings


# Rule 2 — duplicates ------------------------------------------------------


def check_duplicate(db: Session, invoice: Invoice) -> list[FindingDraft]:
    findings: list[FindingDraft] = []
    if invoice.vendor_id is None:
        return findings

    exact = db.scalar(
        select(Invoice).where(
            and_(
                Invoice.id != invoice.id,
                Invoice.vendor_id == invoice.vendor_id,
                Invoice.invoice_number == invoice.invoice_number,
                Invoice.archived.is_(False),
            )
        )
    )
    if exact:
        findings.append(
            FindingDraft(
                rule_code=DUP_EXACT,
                severity=FindingSeverity.blocker,
                message=(
                    f"Invoice number {invoice.invoice_number} already exists for this vendor "
                    f"(invoice {exact.id})."
                ),
                reference={"duplicate_invoice_id": str(exact.id)},
            )
        )

    window = timedelta(days=7)
    soft = list(
        db.scalars(
            select(Invoice).where(
                and_(
                    Invoice.id != invoice.id,
                    Invoice.vendor_id == invoice.vendor_id,
                    Invoice.total == invoice.total,
                    Invoice.archived.is_(False),
                    Invoice.invoice_date.between(
                        invoice.invoice_date - window,
                        invoice.invoice_date + window,
                    ),
                )
            )
        )
    )
    for s in soft:
        findings.append(
            FindingDraft(
                rule_code=DUP_SOFT,
                severity=FindingSeverity.warning,
                message=(
                    f"Same vendor has another invoice of {invoice.total} dated {s.invoice_date} "
                    f"(invoice #{s.invoice_number}). Check for duplicate billing."
                ),
                reference={"near_duplicate_invoice_id": str(s.id)},
            )
        )
    return findings


# Rule 3 — unit price drift -----------------------------------------------


def check_unit_price(
    invoice: Invoice,
    *,
    tolerance_pct: Decimal,
) -> list[FindingDraft]:
    findings: list[FindingDraft] = []
    for li in invoice.line_items:
        if not li.boq_item_id or not li.boq_item:
            continue
        boq_price = li.boq_item.unit_price
        if boq_price == 0:
            continue
        diff = (li.unit_price - boq_price).copy_abs()
        diff_pct = (diff / boq_price) * Decimal("100")
        if diff_pct > tolerance_pct:
            over = li.unit_price - boq_price
            suggested_ded = (over * li.quantity).quantize(Decimal("0.01")) if over > 0 else Decimal("0")
            findings.append(
                FindingDraft(
                    rule_code=UNIT_PRICE_DRIFT,
                    severity=FindingSeverity.blocker,
                    message=(
                        f"Line {li.line_number} unit price {li.unit_price} differs from BoQ "
                        f"{boq_price} by {diff_pct:.2f}% (tolerance {tolerance_pct}%)."
                    ),
                    reference={
                        "invoice_line_item_id": str(li.id),
                        "boq_item_id": str(li.boq_item_id),
                        "boq_unit_price": str(boq_price),
                        "invoice_unit_price": str(li.unit_price),
                    },
                    suggested_deduction=suggested_ded,
                )
            )
    return findings


# Rule 4 — cumulative quantity --------------------------------------------


def check_cumulative_quantity(
    db: Session,
    invoice: Invoice,
) -> list[FindingDraft]:
    findings: list[FindingDraft] = []
    if invoice.contract_id is None:
        return findings

    # Aggregate quantity already billed per BoQ line across other non-archived invoices.
    prior_rows = db.execute(
        select(
            InvoiceLineItem.boq_item_id,
            InvoiceLineItem.quantity,
        )
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(
            Invoice.contract_id == invoice.contract_id,
            Invoice.archived.is_(False),
            Invoice.id != invoice.id,
            InvoiceLineItem.boq_item_id.is_not(None),
        )
    ).all()
    prior_qty: dict[str, Decimal] = {}
    for r in prior_rows:
        key = str(r.boq_item_id)
        prior_qty[key] = prior_qty.get(key, Decimal("0")) + Decimal(r.quantity)

    # Add current invoice's lines per BoQ line.
    current_qty: dict[str, Decimal] = {}
    for li in invoice.line_items:
        if li.boq_item_id is None:
            continue
        k = str(li.boq_item_id)
        current_qty[k] = current_qty.get(k, Decimal("0")) + li.quantity

    boq_ids = {*prior_qty.keys(), *current_qty.keys()}
    boq_items = {
        str(b.id): b
        for b in db.scalars(
            select(BoqItem).where(BoqItem.id.in_([i for i in boq_ids])) if boq_ids else select(BoqItem).where(BoqItem.id.is_(None))
        )
    }

    for k, current in current_qty.items():
        prior = prior_qty.get(k, Decimal("0"))
        boq = boq_items.get(k)
        if not boq:
            continue
        total_after = prior + current
        if total_after > boq.quantity:
            over = total_after - boq.quantity
            recovery_qty = current - over
            excess_qty = over
            suggested_ded = (excess_qty * boq.unit_price).quantize(Decimal("0.01"))
            findings.append(
                FindingDraft(
                    rule_code=QTY_BREACH,
                    severity=FindingSeverity.blocker,
                    message=(
                        f"BoQ line {boq.line_number} '{boq.description}' would exceed contracted "
                        f"quantity: {prior} (prior) + {current} (this invoice) = {total_after} > "
                        f"BoQ quantity {boq.quantity}. Excess {excess_qty} {boq.uom}. "
                        f"Recoverable by paying only {max(recovery_qty, Decimal('0'))} {boq.uom}."
                    ),
                    reference={
                        "boq_item_id": k,
                        "boq_line_number": boq.line_number,
                        "boq_quantity": str(boq.quantity),
                        "prior_quantity": str(prior),
                        "this_invoice_quantity": str(current),
                        "excess_quantity": str(excess_qty),
                    },
                    suggested_deduction=suggested_ded,
                )
            )
    return findings


# Rule 5 — cumulative value -----------------------------------------------


def check_cumulative_value(
    db: Session,
    invoice: Invoice,
) -> list[FindingDraft]:
    if invoice.contract_id is None:
        return []
    contract = db.get(Contract, invoice.contract_id)
    if not contract:
        return []
    prior = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.contract_id == invoice.contract_id,
            Invoice.id != invoice.id,
            Invoice.archived.is_(False),
        )
    ) or Decimal("0")
    prior = Decimal(prior)
    total_after = prior + invoice.total
    if total_after > contract.value:
        over = total_after - contract.value
        return [
            FindingDraft(
                rule_code=VALUE_BREACH,
                severity=FindingSeverity.blocker,
                message=(
                    f"Cumulative invoiced {prior} + this invoice {invoice.total} = {total_after} "
                    f"exceeds contract value {contract.value} by {over}."
                ),
                reference={
                    "contract_id": str(contract.id),
                    "contract_value": str(contract.value),
                    "prior_invoiced": str(prior),
                    "this_invoice_total": str(invoice.total),
                    "overage": str(over),
                },
                suggested_deduction=_quant(over),
            )
        ]
    return []


# Rule 6 — contract date window -------------------------------------------


def check_date_window(
    db: Session,
    invoice: Invoice,
) -> list[FindingDraft]:
    if invoice.contract_id is None:
        return []
    contract = db.get(Contract, invoice.contract_id)
    if not contract:
        return []
    if not (contract.start_date <= invoice.invoice_date <= contract.end_date):
        return [
            FindingDraft(
                rule_code=DATE_OUT_OF_WINDOW,
                severity=FindingSeverity.blocker,
                message=(
                    f"Invoice date {invoice.invoice_date} is outside the contract window "
                    f"{contract.start_date} → {contract.end_date}."
                ),
                reference={
                    "contract_id": str(contract.id),
                    "contract_start_date": contract.start_date.isoformat(),
                    "contract_end_date": contract.end_date.isoformat(),
                    "invoice_date": invoice.invoice_date.isoformat(),
                },
            )
        ]
    return []


# Rule 7 — vendor identity ------------------------------------------------


def check_vendor_identity(
    db: Session,
    invoice: Invoice,
    fields: dict,
) -> list[FindingDraft]:
    if invoice.contract_id is None or invoice.vendor_id is None:
        return []
    contract = db.get(Contract, invoice.contract_id)
    if not contract or not contract.vendor:
        return []
    vendor = contract.vendor
    findings: list[FindingDraft] = []

    extracted_trn = (fields.get("vendor_trn") or "").strip()
    extracted_name = (fields.get("vendor_legal_name") or "").strip()

    if extracted_trn and extracted_trn != (vendor.trn or ""):
        findings.append(
            FindingDraft(
                rule_code=VENDOR_MISMATCH,
                severity=FindingSeverity.blocker,
                message=(
                    f"Invoice TRN {extracted_trn} does not match contract vendor TRN "
                    f"{vendor.trn}."
                ),
                reference={
                    "vendor_id": str(vendor.id),
                    "contract_vendor_trn": vendor.trn,
                    "invoice_vendor_trn": extracted_trn,
                },
            )
        )

    if extracted_name:
        from app.services.text_similarity import ratio

        r = ratio(extracted_name, vendor.legal_name)
        if r < 0.6:
            # Name mismatch alone is a warning; TRN mismatch above is the hard block.
            findings.append(
                FindingDraft(
                    rule_code=VENDOR_MISMATCH,
                    severity=FindingSeverity.warning,
                    message=(
                        f"Invoice vendor name {extracted_name!r} doesn't closely match contract "
                        f"vendor {vendor.legal_name!r} (similarity {r:.2f})."
                    ),
                    reference={
                        "vendor_id": str(vendor.id),
                        "contract_vendor_name": vendor.legal_name,
                        "invoice_vendor_name": extracted_name,
                        "similarity": round(r, 2),
                    },
                )
            )
    return findings


# Mapping sanity ---------------------------------------------------------


def check_boq_mapping(invoice: Invoice) -> list[FindingDraft]:
    unmapped = [
        li
        for li in invoice.line_items
        if li.boq_item_id is None and not li.not_in_boq
    ]
    if not unmapped:
        return []
    return [
        FindingDraft(
            rule_code=BOQ_MAPPING_MISSING,
            severity=FindingSeverity.warning,
            message=(
                f"{len(unmapped)} invoice line(s) are not mapped to a BoQ line and not explicitly "
                "flagged 'not in BoQ'. Review mapping before deciding."
            ),
            reference={
                "unmapped_line_ids": [str(li.id) for li in unmapped],
            },
        )
    ]
