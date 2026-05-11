"""Orchestrates the seven MVP rules and persists Findings."""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models.extraction import Extraction
from app.models.finding import Finding
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.validation.rules import (
    FindingDraft,
    check_arithmetic,
    check_boq_mapping,
    check_cumulative_quantity,
    check_cumulative_value,
    check_date_window,
    check_duplicate,
    check_unit_price,
    check_vendor_identity,
)


def _latest_fields(db: Session, invoice_id: UUID) -> dict:
    latest = db.scalar(
        select(Extraction)
        .where(Extraction.invoice_id == invoice_id)
        .order_by(Extraction.extracted_at.desc())
        .limit(1)
    )
    if not latest:
        return {}
    return (latest.extracted_json or {}).get("fields") or {}


def run_all(db: Session, invoice: Invoice) -> list[Finding]:
    settings = get_settings()
    vat_rate = Decimal(str(settings.vat_rate))
    unit_price_tolerance_pct = Decimal(str(settings.unit_price_tolerance_pct))

    drafts: list[FindingDraft] = []
    drafts.extend(check_arithmetic(invoice, vat_rate=vat_rate))
    drafts.extend(check_duplicate(db, invoice))
    drafts.extend(check_unit_price(invoice, tolerance_pct=unit_price_tolerance_pct))
    drafts.extend(check_cumulative_quantity(db, invoice))
    drafts.extend(check_cumulative_value(db, invoice))
    drafts.extend(check_date_window(db, invoice))
    drafts.extend(check_vendor_identity(db, invoice, _latest_fields(db, invoice.id)))
    drafts.extend(check_boq_mapping(invoice))

    # Replace prior findings for this invoice (idempotent runs).
    for prev in db.scalars(select(Finding).where(Finding.invoice_id == invoice.id)):
        db.delete(prev)
    db.flush()

    persisted: list[Finding] = []
    for d in drafts:
        ref = dict(d.reference)
        if d.suggested_deduction and d.suggested_deduction > 0:
            ref.setdefault("suggested_deduction", str(d.suggested_deduction))
        row = Finding(
            invoice_id=invoice.id,
            rule_code=d.rule_code,
            severity=d.severity,
            message=d.message,
            reference_json=ref or None,
        )
        db.add(row)
        persisted.append(row)
    db.flush()
    return persisted


def load_invoice_for_validation(db: Session, invoice_id: UUID) -> Invoice | None:
    return db.scalar(
        select(Invoice)
        .options(selectinload(Invoice.line_items).selectinload(InvoiceLineItem.boq_item))
        .where(Invoice.id == invoice_id, Invoice.archived.is_(False))
    )
