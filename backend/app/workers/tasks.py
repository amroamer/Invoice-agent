"""Celery tasks wired to the pipeline stages."""
from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from uuid import UUID

from app.agents.extraction import extract as run_extraction
from app.db.session import SessionLocal
from app.models.extraction import Extraction
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.services.ocr import run_ocr
from app.workers.celery_app import celery_app

log = logging.getLogger(__name__)


def _dec(v: object) -> Decimal:
    try:
        return Decimal(str(v).replace(",", "")) if v not in (None, "") else Decimal("0")
    except InvalidOperation:
        return Decimal("0")


@celery_app.task(name="extract_invoice", bind=True, max_retries=2)
def extract_invoice(self, invoice_id: str) -> dict:  # noqa: ARG001
    with SessionLocal() as db:
        invoice = db.get(Invoice, UUID(invoice_id))
        if not invoice or not invoice.original_file_path:
            return {"status": "missing_invoice"}

        with open(invoice.original_file_path, "rb") as fh:
            blob = fh.read()
        ext = invoice.original_file_path.rsplit(".", 1)[-1].lower()
        ocr = run_ocr(blob, ext)

        if not ocr.text.strip():
            db.add(
                Extraction(
                    invoice_id=invoice.id,
                    extracted_json={"error": "empty OCR", "method": ocr.method},
                    confidence_json={},
                    model="ocr-only",
                )
            )
            db.commit()
            return {"status": "empty_ocr"}

        result = run_extraction(db, ocr.text, invoice_id=invoice.id)

        db.add(
            Extraction(
                invoice_id=invoice.id,
                extracted_json={
                    "fields": {k: v for k, v in result.fields.items() if k != "line_items"},
                    "line_items": result.line_items,
                    "ocr_method": ocr.method,
                    "ocr_page_count": ocr.page_count,
                },
                confidence_json=result.confidence,
                model=result.model or "qwen2.5:7b",
            )
        )

        fields = result.fields
        subtotal = _dec(fields.get("subtotal"))
        vat = _dec(fields.get("vat_amount"))
        total = _dec(fields.get("total"))
        if total == 0 and (subtotal + vat) > 0:
            total = subtotal + vat
        invoice.subtotal = subtotal
        invoice.vat = vat
        invoice.total = total
        if fields.get("currency"):
            invoice.currency = str(fields["currency"])[:3].upper() or invoice.currency
        if fields.get("invoice_number"):
            invoice.invoice_number = str(fields["invoice_number"])
        if fields.get("invoice_date"):
            try:
                from datetime import date

                y, m, d = str(fields["invoice_date"]).split("-")
                invoice.invoice_date = date(int(y), int(m), int(d))
            except (ValueError, TypeError):
                pass

        # replace any provisional lines, then write the extracted ones.
        for existing in list(invoice.line_items):
            db.delete(existing)
        db.flush()
        for li in result.line_items:
            db.add(
                InvoiceLineItem(
                    invoice_id=invoice.id,
                    line_number=li.get("line_number"),
                    description=li.get("description") or "",
                    uom=li.get("uom"),
                    quantity=_dec(li.get("quantity")),
                    unit_price=_dec(li.get("unit_price")),
                    line_total=_dec(li.get("line_total")),
                )
            )
        db.commit()
        return {"status": "ok", "model": result.model}
