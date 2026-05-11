import csv
import io
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.core.config import get_settings
from app.models.boq_item import BoqItem
from app.models.contract import Contract
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.models.user import User
from app.schemas.boq import (
    BoqCommitRequest,
    BoqItemOut,
    BoqLineCumulative,
    BoqLineHistoryEntry,
    BoqPreviewOut,
    BoqPreviewRow,
)
from app.services.audit import log_action
from app.services.boq_parser import parse_boq, preview
from app.services.cumulative import boq_lines_cumulative

router = APIRouter()


@router.post("/{contract_id}/preview", response_model=BoqPreviewOut)
async def preview_boq(
    contract_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> BoqPreviewOut:
    contract = db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    try:
        rows = parse_boq(file.filename or "upload", await file.read())
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    settings = get_settings()
    result = preview(
        rows,
        contract_value=contract.value,
        tolerance_pct=settings.boq_total_tolerance_pct,
    )
    return BoqPreviewOut(
        rows=[
            BoqPreviewRow(
                line_number=r.line_number,
                description=r.description,
                uom=r.uom,
                quantity=r.quantity,
                unit_price=r.unit_price,
                line_total=r.line_total,
                errors=r.errors,
            )
            for r in result.rows
        ],
        row_errors=result.row_errors,
        sum_line_total=result.sum_line_total,
        contract_value=result.contract_value,
        tolerance_pct=result.tolerance_pct,
        within_tolerance=result.within_tolerance,
    )


@router.post("/{contract_id}/commit", response_model=list[BoqItemOut])
def commit_boq(
    contract_id: UUID,
    body: BoqCommitRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[BoqItem]:
    contract = db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")

    for prior in db.scalars(
        select(BoqItem).where(BoqItem.contract_id == contract_id, BoqItem.active.is_(True))
    ):
        prior.active = False

    created: list[BoqItem] = []
    for r in body.rows:
        total = r.line_total if r.line_total is not None else (r.quantity * r.unit_price)
        item = BoqItem(
            contract_id=contract_id,
            line_number=r.line_number,
            description=r.description,
            uom=r.uom,
            quantity=r.quantity,
            unit_price=r.unit_price,
            line_total=Decimal(total).quantize(Decimal("0.01")),
            active=True,
            created_by=admin.id,
            updated_by=admin.id,
        )
        db.add(item)
        created.append(item)
    db.flush()
    log_action(
        db,
        user_id=admin.id,
        action="boq.commit",
        entity_type="contract",
        entity_id=contract_id,
        payload={"row_count": len(created)},
    )
    db.commit()
    for item in created:
        db.refresh(item)
    return created


@router.get("/{contract_id}", response_model=list[BoqItemOut])
def list_boq(
    contract_id: UUID,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[BoqItem]:
    q = select(BoqItem).where(BoqItem.contract_id == contract_id)
    if not include_inactive:
        q = q.where(BoqItem.active.is_(True))
    return list(db.scalars(q.order_by(BoqItem.line_number)))


@router.get("/{contract_id}/cumulative", response_model=list[BoqLineCumulative])
def cumulative(
    contract_id: UUID,
    exclude_invoice_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[dict]:
    if not db.get(Contract, contract_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    return boq_lines_cumulative(db, contract_id, exclude_invoice_id)


@router.get("/{contract_id}/export")
def export_boq(
    contract_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> StreamingResponse:
    items = list(
        db.scalars(
            select(BoqItem)
            .where(BoqItem.contract_id == contract_id, BoqItem.active.is_(True))
            .order_by(BoqItem.line_number)
        )
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["line_number", "description", "uom", "quantity", "unit_price", "line_total"])
    for it in items:
        writer.writerow(
            [
                it.line_number,
                it.description,
                it.uom,
                str(it.quantity),
                str(it.unit_price),
                str(it.line_total),
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="boq-{contract_id}.csv"'},
    )


@router.get("/line/{boq_item_id}/history", response_model=list[BoqLineHistoryEntry])
def line_history(
    boq_item_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[BoqLineHistoryEntry]:
    item = db.get(BoqItem, boq_item_id)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "BoQ line not found")
    rows = db.execute(
        select(
            Invoice.id,
            Invoice.invoice_number,
            Invoice.invoice_date,
            InvoiceLineItem.quantity,
            InvoiceLineItem.line_total,
        )
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(
            InvoiceLineItem.boq_item_id == boq_item_id,
            Invoice.archived.is_(False),
        )
        .order_by(Invoice.invoice_date)
    ).all()
    return [
        BoqLineHistoryEntry(
            invoice_id=r.id,
            invoice_number=r.invoice_number,
            invoice_date=r.invoice_date.isoformat(),
            quantity=r.quantity,
            amount=r.line_total,
        )
        for r in rows
    ]
