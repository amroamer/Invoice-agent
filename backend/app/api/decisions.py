from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_officer_or_admin
from app.models.decision import Decision
from app.models.enums import InvoiceStatus, Scenario
from app.models.invoice import Invoice
from app.models.recommendation import Recommendation
from app.models.user import User
from app.schemas.decision import DecisionIn, DecisionOut
from app.services.audit import log_action

router = APIRouter()


def _load_invoice(db: Session, invoice_id: UUID) -> Invoice:
    inv = db.scalar(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.archived.is_(False))
    )
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return inv


@router.post("/{invoice_id}", response_model=DecisionOut)
def decide(
    invoice_id: UUID,
    body: DecisionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> Decision:
    inv = _load_invoice(db, invoice_id)
    recs = list(
        db.scalars(select(Recommendation).where(Recommendation.invoice_id == inv.id))
    )
    proposed = {r.scenario for r in recs}
    is_override = bool(recs) and body.scenario_accepted not in proposed
    if is_override and not (body.override_reason and body.override_reason.strip()):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "override_reason is required when choosing a scenario the engine did not propose",
        )

    # Supersede any prior decision.
    for prev in db.scalars(select(Decision).where(Decision.invoice_id == inv.id)):
        db.delete(prev)
    db.flush()

    decision = Decision(
        invoice_id=inv.id,
        decided_by=user.id,
        scenario_accepted=body.scenario_accepted,
        override_reason=body.override_reason.strip() if body.override_reason else None,
    )
    db.add(decision)

    # Update invoice status based on decision.
    if body.scenario_accepted == Scenario.do_not_pay:
        inv.status = InvoiceStatus.rejected
    else:
        inv.status = InvoiceStatus.decided
    inv.updated_by = user.id

    log_action(
        db,
        user_id=user.id,
        action="decision.record",
        entity_type="invoice",
        entity_id=inv.id,
        payload={
            "scenario": body.scenario_accepted.value,
            "override": is_override,
            "override_reason": body.override_reason,
        },
    )
    db.commit()
    db.refresh(decision)
    return decision


@router.get("/{invoice_id}", response_model=DecisionOut | None)
def latest(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> Decision | None:
    return db.scalar(
        select(Decision)
        .where(Decision.invoice_id == invoice_id)
        .order_by(Decision.decided_at.desc())
        .limit(1)
    )
