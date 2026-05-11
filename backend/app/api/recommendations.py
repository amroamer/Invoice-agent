from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.recommendation import generate_scenario_text
from app.api.deps import get_db, require_officer_or_admin
from app.models.enums import FindingSeverity
from app.models.finding import Finding
from app.models.invoice import Invoice
from app.models.recommendation import Recommendation
from app.models.user import User
from app.schemas.recommendation import GenerateResponse, RecommendationOut
from app.services.audit import log_action
from app.services.recommendation import synthesize
from app.validation.runner import load_invoice_for_validation, run_all

router = APIRouter()


def _load_invoice(db: Session, invoice_id: UUID) -> Invoice:
    inv = load_invoice_for_validation(db, invoice_id)
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return inv


@router.post("/{invoice_id}/generate", response_model=GenerateResponse)
def generate(
    invoice_id: UUID,
    re_validate: bool = True,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> GenerateResponse:
    inv = _load_invoice(db, invoice_id)
    if inv.contract_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Confirm a contract match before generating recommendations"
        )

    if re_validate:
        findings = run_all(db, inv)
    else:
        findings = list(
            db.scalars(select(Finding).where(Finding.invoice_id == inv.id))
        )

    scenarios = synthesize(inv, findings)

    # Try to enhance justifications via Ollama; fall back silently if unavailable.
    llm_text = generate_scenario_text(
        db, inv, findings, [s.scenario.value for s in scenarios]
    )
    for draft in scenarios:
        block = llm_text.get(draft.scenario.value)
        if not block:
            continue
        if block.get("justification"):
            draft.justification = block["justification"]
        if draft.scenario.value == "conditional" and block.get("clarification_email"):
            draft.clarification_email = block["clarification_email"]

    # Replace any prior recommendations for this invoice (idempotent generation).
    for prev in db.scalars(select(Recommendation).where(Recommendation.invoice_id == inv.id)):
        db.delete(prev)
    db.flush()

    persisted: list[Recommendation] = []
    for draft in scenarios:
        row = Recommendation(
            invoice_id=inv.id,
            scenario=draft.scenario,
            confidence=draft.confidence,
            justification=draft.justification,
            deduction_amount=draft.deduction_amount,
            clarification_email=draft.clarification_email,
        )
        db.add(row)
        persisted.append(row)
    db.flush()

    log_action(
        db,
        user_id=user.id,
        action="recommendation.generate",
        entity_type="invoice",
        entity_id=inv.id,
        payload={
            "scenarios": [s.scenario.value for s in scenarios],
            "finding_count": len(findings),
        },
    )
    db.commit()
    for r in persisted:
        db.refresh(r)

    return GenerateResponse(
        recommendations=[RecommendationOut.model_validate(r) for r in persisted],
        finding_count=len(findings),
        blocker_count=sum(1 for f in findings if f.severity == FindingSeverity.blocker),
        warning_count=sum(1 for f in findings if f.severity == FindingSeverity.warning),
    )


@router.get("/{invoice_id}", response_model=list[RecommendationOut])
def list_for_invoice(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Recommendation]:
    return list(
        db.scalars(
            select(Recommendation)
            .where(Recommendation.invoice_id == invoice_id)
            .order_by(Recommendation.generated_at.desc())
        )
    )
