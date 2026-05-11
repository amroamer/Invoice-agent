from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_officer_or_admin
from app.models.finding import Finding
from app.models.invoice import Invoice
from app.models.user import User
from app.schemas.validation import FindingOut
from app.services.audit import log_action
from app.validation.runner import load_invoice_for_validation, run_all

router = APIRouter()


def _load_invoice(db: Session, invoice_id: UUID) -> Invoice:
    inv = load_invoice_for_validation(db, invoice_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return inv


@router.post("/{invoice_id}/run", response_model=list[FindingOut])
def run(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> list[Finding]:
    inv = _load_invoice(db, invoice_id)
    findings = run_all(db, inv)
    log_action(
        db,
        user_id=user.id,
        action="validation.run",
        entity_type="invoice",
        entity_id=inv.id,
        payload={"finding_count": len(findings)},
    )
    db.commit()
    for f in findings:
        db.refresh(f)
    return findings


@router.get("/{invoice_id}/findings", response_model=list[FindingOut])
def list_findings(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Finding]:
    return list(
        db.scalars(
            select(Finding)
            .where(Finding.invoice_id == invoice_id)
            .order_by(Finding.severity.desc(), Finding.rule_code)
        )
    )
