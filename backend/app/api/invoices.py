import mimetypes
import os
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.core.config import get_settings
from app.models.contract import Contract
from app.models.enums import InvoiceSource, InvoiceStatus
from app.models.extraction import Extraction
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.models.user import User
from app.schemas.invoice import (
    ExtractionOut,
    InvoiceOut,
    InvoiceUpdate,
    InvoiceUploadResponse,
)
from app.services.audit import log_action
from app.services.invoice_files import store, validate_upload
from app.workers.tasks import extract_invoice as extract_task

router = APIRouter()


def _load_invoice(db: Session, invoice_id: UUID) -> Invoice:
    inv = db.scalar(
        select(Invoice)
        .options(selectinload(Invoice.line_items))
        .where(Invoice.id == invoice_id)
    )
    if not inv or inv.archived:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return inv


@router.post("/upload", response_model=InvoiceUploadResponse)
async def upload(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> InvoiceUploadResponse:
    blob = await file.read()
    ext = validate_upload(file.filename, file.content_type, len(blob))

    invoice = Invoice(
        invoice_number="PENDING",
        invoice_date=date.today(),
        currency="SAR",
        source=InvoiceSource.uploaded,
        status=InvoiceStatus.pending,
        uploaded_by=user.id,
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(invoice)
    db.flush()

    stored = store(
        invoice.id,
        blob,
        original_filename=file.filename or f"upload.{ext}",
        mime_type=file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream",
        extension=ext,
    )
    invoice.original_file_path = stored.path
    log_action(
        db,
        user_id=user.id,
        action="invoice.upload",
        entity_type="invoice",
        entity_id=invoice.id,
        payload={"size_bytes": stored.size_bytes, "original_name": stored.original_name},
    )
    db.commit()
    db.refresh(invoice)

    task_id: str | None = None
    try:
        task = extract_task.delay(str(invoice.id))
        task_id = task.id
    except Exception:  # noqa: BLE001
        # Celery/broker not reachable — leave queued; user can re-run via /re-extract
        task_id = None

    return InvoiceUploadResponse(
        invoice_id=invoice.id,
        task_id=task_id,
        original_name=stored.original_name,
        size_bytes=stored.size_bytes,
    )


@router.post("/{invoice_id}/re-extract", response_model=InvoiceUploadResponse)
def re_extract(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> InvoiceUploadResponse:
    inv = _load_invoice(db, invoice_id)
    if not inv.original_file_path:
        raise HTTPException(status.HTTP_409_CONFLICT, "No source file to re-extract")
    log_action(
        db,
        user_id=user.id,
        action="invoice.re_extract",
        entity_type="invoice",
        entity_id=inv.id,
    )
    db.commit()
    try:
        task = extract_task.delay(str(inv.id))
        task_id = task.id
    except Exception:  # noqa: BLE001
        task_id = None
    return InvoiceUploadResponse(
        invoice_id=inv.id,
        task_id=task_id,
        original_name=os.path.basename(inv.original_file_path),
        size_bytes=os.path.getsize(inv.original_file_path),
    )


@router.post("/{invoice_id}/extract-sync", response_model=ExtractionOut)
def extract_sync(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Extraction:
    """Run extraction inline for dev / troubleshooting."""
    inv = _load_invoice(db, invoice_id)
    if not inv.original_file_path:
        raise HTTPException(status.HTTP_409_CONFLICT, "No source file")
    extract_task.run(str(inv.id))
    db.expire_all()
    latest = db.scalar(
        select(Extraction)
        .where(Extraction.invoice_id == inv.id)
        .order_by(Extraction.extracted_at.desc())
        .limit(1)
    )
    if not latest:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No extraction produced")
    return latest


@router.get("", response_model=list[InvoiceOut])
def list_invoices(
    status_in: list[InvoiceStatus] | None = Query(default=None, alias="status"),
    contract_id: UUID | None = None,
    project_id: UUID | None = None,
    vendor_id: UUID | None = None,
    source: InvoiceSource | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Invoice]:
    stmt = select(Invoice).options(selectinload(Invoice.line_items)).where(Invoice.archived.is_(False))
    conds = []
    if status_in:
        conds.append(Invoice.status.in_(status_in))
    if contract_id:
        conds.append(Invoice.contract_id == contract_id)
    if project_id:
        stmt = stmt.join(Contract, Contract.id == Invoice.contract_id)
        conds.append(Contract.project_id == project_id)
    if vendor_id:
        conds.append(Invoice.vendor_id == vendor_id)
    if source:
        conds.append(Invoice.source == source)
    if date_from:
        conds.append(Invoice.invoice_date >= date_from)
    if date_to:
        conds.append(Invoice.invoice_date <= date_to)
    if q and q.strip():
        needle = f"%{q.strip()}%"
        conds.append(or_(Invoice.invoice_number.ilike(needle)))
    if conds:
        stmt = stmt.where(and_(*conds))
    return list(db.scalars(stmt.order_by(Invoice.created_at.desc()).limit(limit)))


@router.get("/{invoice_id}", response_model=InvoiceOut)
def get_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> Invoice:
    return _load_invoice(db, invoice_id)


@router.get("/{invoice_id}/file")
def get_invoice_file(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> FileResponse:
    inv = _load_invoice(db, invoice_id)
    if not inv.original_file_path or not os.path.exists(inv.original_file_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File missing on disk")
    return FileResponse(
        inv.original_file_path,
        filename=os.path.basename(inv.original_file_path),
        media_type=mimetypes.guess_type(inv.original_file_path)[0] or "application/octet-stream",
    )


@router.get("/{invoice_id}/extraction", response_model=ExtractionOut | None)
def get_extraction(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> Extraction | None:
    return db.scalar(
        select(Extraction)
        .where(Extraction.invoice_id == invoice_id)
        .order_by(Extraction.extracted_at.desc())
        .limit(1)
    )


@router.patch("/{invoice_id}", response_model=InvoiceOut)
def update_invoice(
    invoice_id: UUID,
    body: InvoiceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> Invoice:
    inv = _load_invoice(db, invoice_id)
    updated_fields: dict[str, object] = {}
    for field in ("invoice_number", "invoice_date", "subtotal", "vat", "total", "currency", "vendor_id"):
        val = getattr(body, field)
        if val is not None:
            setattr(inv, field, val)
            updated_fields[field] = str(val)

    if body.line_items is not None:
        for existing in list(inv.line_items):
            db.delete(existing)
        db.flush()
        for li in body.line_items:
            db.add(
                InvoiceLineItem(
                    invoice_id=inv.id,
                    line_number=li.line_number,
                    boq_item_id=li.boq_item_id,
                    description=li.description,
                    uom=li.uom,
                    quantity=li.quantity,
                    unit_price=li.unit_price,
                    line_total=li.line_total,
                    not_in_boq=li.not_in_boq,
                )
            )

    if body.fields is not None:
        latest = db.scalar(
            select(Extraction)
            .where(Extraction.invoice_id == inv.id)
            .order_by(Extraction.extracted_at.desc())
            .limit(1)
        )
        base_fields = (latest.extracted_json or {}).get("fields") if latest else {}
        merged = {**(base_fields or {}), **{k: v for k, v in body.fields.items() if v != ""}}
        db.add(
            Extraction(
                invoice_id=inv.id,
                extracted_json={
                    "fields": merged,
                    "line_items": [li.model_dump(mode="json") for li in body.line_items or []],
                    "source": "officer_corrected",
                },
                confidence_json=None,
                model="officer_corrected",
            )
        )

    inv.status = InvoiceStatus.reviewed
    inv.updated_by = user.id
    log_action(
        db,
        user_id=user.id,
        action="invoice.update_fields",
        entity_type="invoice",
        entity_id=inv.id,
        payload=updated_fields,
    )
    db.commit()
    db.refresh(inv)
    return inv
