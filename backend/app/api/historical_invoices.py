from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.models.boq_item import BoqItem
from app.models.contract import Contract
from app.models.enums import InvoiceSource, InvoiceStatus
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.models.payment import Payment
from app.models.user import User
from app.models.vendor import Vendor
from app.schemas.historical import (
    HistoricalCommitRequest,
    HistoricalEditRequest,
    HistoricalInvoiceIn,
    HistoricalInvoiceOut,
    HistoricalMappingPreview,
    HistoricalPreviewOut,
    HistoricalPreviewRow,
)
from app.services.audit import log_action
from app.services.historical_parser import parse_historical

router = APIRouter()


_STATUS_MAP: dict[str, InvoiceStatus] = {
    "paid": InvoiceStatus.paid,
    "unpaid": InvoiceStatus.pending,
    "pending": InvoiceStatus.pending,
    "partially_paid": InvoiceStatus.partially_paid,
    "partial": InvoiceStatus.partially_paid,
}


def _resolve_status(raw: str) -> InvoiceStatus:
    return _STATUS_MAP.get((raw or "").strip().lower(), InvoiceStatus.pending)


@router.post("/preview", response_model=HistoricalPreviewOut)
async def preview(
    file: UploadFile = File(...),
    mappings_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> HistoricalPreviewOut:
    blob = await file.read()
    map_blob = await mappings_file.read() if mappings_file else None
    try:
        result = parse_historical(
            file.filename or "upload",
            blob,
            mappings_blob=map_blob,
            mappings_filename=(mappings_file.filename if mappings_file else None),
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    contract_numbers = {r.contract_number for r in result.invoices if r.contract_number}
    trns = {r.vendor_trn for r in result.invoices if r.vendor_trn}
    boq_lines = {(r.invoice_number, r.boq_line_number) for r in result.mappings}

    existing_contracts = {
        c.contract_number for c in db.scalars(
            select(Contract).where(Contract.contract_number.in_(contract_numbers or [""]))
        )
    }
    existing_trns = {
        v.trn for v in db.scalars(select(Vendor).where(Vendor.trn.in_(trns or [""])))
    }

    unresolved_contracts = sorted(contract_numbers - existing_contracts)
    unresolved_vendors = sorted(trns - existing_trns)

    # Can only check BoQ line validity per invoice once we know its contract.
    # For preview just flag rows whose contract is unresolved.
    unresolved_boq = sorted(
        {
            f"{inv}:{ln}"
            for (inv, ln) in boq_lines
            if any(r.invoice_number == inv and r.contract_number in unresolved_contracts for r in result.invoices)
        }
    )

    return HistoricalPreviewOut(
        invoices=[
            HistoricalPreviewRow(
                invoice_number=r.invoice_number,
                vendor_trn=r.vendor_trn,
                contract_number=r.contract_number,
                invoice_date=r.invoice_date,
                subtotal=r.subtotal,
                vat=r.vat,
                total=r.total,
                status=r.status,
                paid_amount=r.paid_amount,
                payment_date=r.payment_date,
                payment_reference=r.payment_reference,
                errors=r.errors,
            )
            for r in result.invoices
        ],
        mappings=[
            HistoricalMappingPreview(
                invoice_number=m.invoice_number,
                boq_line_number=m.boq_line_number,
                quantity=m.quantity,
                amount=m.amount,
                errors=m.errors,
            )
            for m in result.mappings
        ],
        row_errors=result.row_errors,
        unresolved_contracts=unresolved_contracts,
        unresolved_vendors=unresolved_vendors,
        unresolved_boq_lines=unresolved_boq,
    )


def _attach_mappings(
    db: Session,
    invoice: Invoice,
    contract_id: UUID,
    mappings: list,
) -> None:
    # Resolve BoQ line numbers → boq_item_ids for the contract's active BoQ.
    line_nums = {m.boq_line_number for m in mappings if m.boq_line_number}
    ids_by_num: dict[int, UUID] = {}
    if line_nums:
        rows = db.execute(
            select(BoqItem.id, BoqItem.line_number).where(
                BoqItem.contract_id == contract_id,
                BoqItem.active.is_(True),
                BoqItem.line_number.in_(line_nums),
            )
        ).all()
        ids_by_num = {r.line_number: r.id for r in rows}

    for m in mappings:
        boq_id = m.boq_item_id or ids_by_num.get(m.boq_line_number or -1)
        description = m.description or ""
        if boq_id and not description:
            item = db.get(BoqItem, boq_id)
            description = item.description if item else ""
        unit_price = (m.amount / m.quantity) if m.quantity else Decimal("0")
        db.add(
            InvoiceLineItem(
                invoice_id=invoice.id,
                boq_item_id=boq_id,
                line_number=m.boq_line_number,
                description=description,
                quantity=m.quantity,
                unit_price=unit_price,
                line_total=Decimal(m.amount).quantize(Decimal("0.01")),
                not_in_boq=boq_id is None,
            )
        )


def _resolve_refs(
    db: Session, row: HistoricalInvoiceIn
) -> tuple[Contract, Vendor]:
    contract: Contract | None = None
    if row.contract_id:
        contract = db.get(Contract, row.contract_id)
    elif row.contract_number:
        contract = db.scalar(
            select(Contract).where(Contract.contract_number == row.contract_number)
        )
    if not contract:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Contract not found: {row.contract_number or row.contract_id}",
        )
    vendor: Vendor | None = None
    if row.vendor_id:
        vendor = db.get(Vendor, row.vendor_id)
    elif row.vendor_trn:
        vendor = db.scalar(select(Vendor).where(Vendor.trn == row.vendor_trn))
    if not vendor:
        vendor = db.get(Vendor, contract.vendor_id)
    return contract, vendor


@router.post("/commit", response_model=list[HistoricalInvoiceOut])
def commit(
    body: HistoricalCommitRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[Invoice]:
    created: list[Invoice] = []
    for row in body.invoices:
        contract, vendor = _resolve_refs(db, row)
        status_enum = _resolve_status(row.status)
        inv = Invoice(
            contract_id=contract.id,
            vendor_id=vendor.id if vendor else contract.vendor_id,
            invoice_number=row.invoice_number,
            invoice_date=row.invoice_date,
            subtotal=row.subtotal,
            vat=row.vat,
            total=row.total,
            currency=contract.currency,
            source=InvoiceSource.historical,
            status=status_enum,
            uploaded_by=admin.id,
            created_by=admin.id,
            updated_by=admin.id,
        )
        db.add(inv)
        db.flush()
        _attach_mappings(db, inv, contract.id, row.mappings)
        if row.paid_amount and row.paid_amount > 0:
            db.add(
                Payment(
                    invoice_id=inv.id,
                    amount=row.paid_amount,
                    payment_date=row.payment_date or row.invoice_date,
                    reference=row.payment_reference or f"HIST-{row.invoice_number}",
                    recorded_by=admin.id,
                )
            )
        created.append(inv)

    log_action(
        db,
        user_id=admin.id,
        action="historical.bulk_commit",
        entity_type="invoice",
        entity_id=None,
        payload={"count": len(created)},
    )
    db.commit()
    for inv in created:
        db.refresh(inv)
    return created


@router.get("", response_model=list[HistoricalInvoiceOut])
def list_historical(
    contract_id: UUID | None = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Invoice]:
    q = select(Invoice).where(Invoice.source == InvoiceSource.historical)
    if contract_id:
        q = q.where(Invoice.contract_id == contract_id)
    if not include_archived:
        q = q.where(Invoice.archived.is_(False))
    return list(db.scalars(q.order_by(Invoice.invoice_date.desc())))


@router.patch("/{invoice_id}", response_model=HistoricalInvoiceOut)
def edit_historical(
    invoice_id: UUID,
    body: HistoricalEditRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Invoice:
    """Edit a historical invoice by archiving the old row and inserting a new version.

    Preserves audit-grade immutability while updating the cumulative view.
    """
    old = db.get(Invoice, invoice_id)
    if not old or old.source != InvoiceSource.historical:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Historical invoice not found")
    if old.archived:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice already archived")

    old_lines = list(
        db.scalars(select(InvoiceLineItem).where(InvoiceLineItem.invoice_id == old.id))
    )
    old_payments = list(db.scalars(select(Payment).where(Payment.invoice_id == old.id)))

    new = Invoice(
        contract_id=old.contract_id,
        vendor_id=old.vendor_id,
        invoice_number=old.invoice_number,
        invoice_date=body.invoice_date or old.invoice_date,
        subtotal=body.subtotal if body.subtotal is not None else old.subtotal,
        vat=body.vat if body.vat is not None else old.vat,
        total=body.total if body.total is not None else old.total,
        currency=old.currency,
        source=InvoiceSource.historical,
        status=_resolve_status(body.status) if body.status else old.status,
        uploaded_by=admin.id,
        created_by=old.created_by,
        updated_by=admin.id,
    )
    db.add(new)
    db.flush()

    if body.mappings is not None:
        if old.contract_id is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Cannot remap an invoice without a contract"
            )
        _attach_mappings(db, new, old.contract_id, body.mappings)
    else:
        for line in old_lines:
            db.add(
                InvoiceLineItem(
                    invoice_id=new.id,
                    boq_item_id=line.boq_item_id,
                    line_number=line.line_number,
                    description=line.description,
                    uom=line.uom,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                    line_total=line.line_total,
                    mapping_confidence=line.mapping_confidence,
                    not_in_boq=line.not_in_boq,
                )
            )

    paid_amount_override = body.paid_amount
    if paid_amount_override is not None:
        if paid_amount_override > 0:
            db.add(
                Payment(
                    invoice_id=new.id,
                    amount=paid_amount_override,
                    payment_date=body.payment_date or body.invoice_date or date.today(),
                    reference=body.payment_reference or f"HIST-{new.invoice_number}",
                    recorded_by=admin.id,
                )
            )
    else:
        for p in old_payments:
            db.add(
                Payment(
                    invoice_id=new.id,
                    amount=p.amount,
                    payment_date=p.payment_date,
                    reference=p.reference,
                    recorded_by=admin.id,
                )
            )

    old.archived = True
    old.superseded_by_id = new.id

    log_action(
        db,
        user_id=admin.id,
        action="historical.edit",
        entity_type="invoice",
        entity_id=new.id,
        payload={"archived_id": str(old.id)},
    )
    db.commit()
    db.refresh(new)
    return new


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_historical(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    inv = db.get(Invoice, invoice_id)
    if not inv or inv.source != InvoiceSource.historical:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Historical invoice not found")
    inv.archived = True
    log_action(
        db,
        user_id=admin.id,
        action="historical.archive",
        entity_type="invoice",
        entity_id=inv.id,
    )
    db.commit()
