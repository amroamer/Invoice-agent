from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_officer_or_admin
from app.models.decision import Decision
from app.models.enums import InvoiceStatus, Scenario
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.user import User
from app.schemas.payment import PaymentIn, PaymentOut
from app.services.audit import log_action

router = APIRouter()


def _load_invoice(db: Session, invoice_id: UUID) -> Invoice:
    inv = db.scalar(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.archived.is_(False))
    )
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return inv


@router.post("/{invoice_id}", response_model=PaymentOut)
def record(
    invoice_id: UUID,
    body: PaymentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> Payment:
    inv = _load_invoice(db, invoice_id)
    decision = db.scalar(
        select(Decision).where(Decision.invoice_id == inv.id).order_by(Decision.decided_at.desc()).limit(1)
    )
    if not decision:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice must be decided before payment")
    if decision.scenario_accepted == Scenario.do_not_pay:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice was rejected; cannot record payment")

    already_paid = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.invoice_id == inv.id)
    ) or Decimal("0")
    already_paid = Decimal(already_paid)

    new_total = already_paid + body.amount
    if new_total > inv.total + Decimal("0.01"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Payment {body.amount} plus prior {already_paid} exceeds invoice total {inv.total}",
        )

    row = Payment(
        invoice_id=inv.id,
        amount=body.amount,
        payment_date=body.payment_date,
        reference=body.reference.strip(),
        recorded_by=user.id,
    )
    db.add(row)

    if new_total >= inv.total:
        inv.status = InvoiceStatus.paid
    else:
        inv.status = InvoiceStatus.partially_paid
    inv.updated_by = user.id

    log_action(
        db,
        user_id=user.id,
        action="payment.record",
        entity_type="invoice",
        entity_id=inv.id,
        payload={
            "amount": str(body.amount),
            "payment_date": body.payment_date.isoformat(),
            "reference": body.reference,
            "new_invoice_status": inv.status.value,
        },
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/{invoice_id}", response_model=list[PaymentOut])
def list_payments(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.invoice_id == invoice_id)
            .order_by(Payment.payment_date.desc())
        )
    )
