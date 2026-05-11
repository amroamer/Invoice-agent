import logging
from dataclasses import asdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.agents.boq_mapping import propose_mappings
from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.models.boq_item import BoqItem
from app.models.contract import Contract
from app.models.extraction import Extraction
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.models.match import Match
from app.models.user import User
from app.schemas.matching import (
    BoqMappingSuggestion,
    MatchCandidateOut,
    MatchConfirmRequest,
    MatchOut,
    SignalOut,
)
from app.services.audit import log_action
from app.services.matching import compute_candidates

log = logging.getLogger(__name__)
router = APIRouter()


def _load_invoice(db: Session, invoice_id: UUID) -> Invoice:
    inv = db.scalar(
        select(Invoice)
        .options(selectinload(Invoice.line_items))
        .where(Invoice.id == invoice_id, Invoice.archived.is_(False))
    )
    if not inv:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    return inv


def _latest_fields(db: Session, invoice: Invoice) -> dict:
    latest = db.scalar(
        select(Extraction)
        .where(Extraction.invoice_id == invoice.id)
        .order_by(Extraction.extracted_at.desc())
        .limit(1)
    )
    if not latest:
        return {}
    fields = (latest.extracted_json or {}).get("fields") or {}
    # Layer in invoice-level corrections that live on the Invoice row.
    if invoice.invoice_number and invoice.invoice_number != "PENDING":
        fields.setdefault("invoice_number", invoice.invoice_number)
    if invoice.currency:
        fields.setdefault("currency", invoice.currency)
    return fields


@router.post("/{invoice_id}/candidates", response_model=list[MatchCandidateOut])
def candidates(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> list[MatchCandidateOut]:
    inv = _load_invoice(db, invoice_id)
    if inv.contract_id is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Invoice already locked to a contract — unlock (admin) before re-matching",
        )
    fields = _latest_fields(db, inv)
    cands = compute_candidates(db, inv, fields)

    # Persist a Match row per candidate — overwriting any prior proposals for idempotency.
    existing = db.scalars(
        select(Match).where(Match.invoice_id == inv.id, Match.confirmed.is_(False))
    )
    for old in existing:
        db.delete(old)
    db.flush()

    persisted: list[Match] = []
    for cand in cands:
        reasoning = {
            "confidence": cand.confidence,
            "signals": [asdict(s) for s in cand.signals],
            "remaining_budget": str(cand.remaining_budget),
            "invoiced_to_date": str(cand.invoiced_to_date),
            "contract_number": cand.contract_number,
            "project_name": cand.project_name,
            "vendor_name": cand.vendor_name,
        }
        m = Match(
            invoice_id=inv.id,
            candidate_contract_id=cand.contract_id,
            confidence=cand.confidence,
            reasoning_json=reasoning,
            confirmed=False,
        )
        db.add(m)
        persisted.append(m)
    db.flush()

    log_action(
        db,
        user_id=user.id,
        action="match.candidates",
        entity_type="invoice",
        entity_id=inv.id,
        payload={"count": len(persisted)},
    )
    db.commit()

    out: list[MatchCandidateOut] = []
    for m, cand in zip(persisted, cands, strict=True):
        out.append(
            MatchCandidateOut(
                match_id=m.id,
                contract_id=cand.contract_id,
                project_id=cand.project_id,
                contract_number=cand.contract_number,
                project_name=cand.project_name,
                vendor_name=cand.vendor_name,
                confidence=cand.confidence,
                signals=[SignalOut(**asdict(s)) for s in cand.signals],
                remaining_budget=cand.remaining_budget,
                invoiced_to_date=cand.invoiced_to_date,
            )
        )
    return out


@router.post("/{invoice_id}/confirm", response_model=MatchOut)
def confirm(
    invoice_id: UUID,
    body: MatchConfirmRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> Match:
    inv = _load_invoice(db, invoice_id)
    if inv.contract_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice already locked to a contract")
    m = db.get(Match, body.match_id)
    if not m or m.invoice_id != inv.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match not found for this invoice")
    contract = db.get(Contract, m.candidate_contract_id)
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Candidate contract missing")

    m.confirmed = True
    m.confirmed_by = user.id
    inv.contract_id = contract.id
    inv.vendor_id = contract.vendor_id
    inv.currency = contract.currency
    log_action(
        db,
        user_id=user.id,
        action="match.confirm",
        entity_type="invoice",
        entity_id=inv.id,
        payload={"contract_id": str(contract.id)},
    )
    db.commit()
    db.refresh(m)
    return m


@router.post("/{invoice_id}/unlock", status_code=status.HTTP_204_NO_CONTENT)
def unlock(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    inv = _load_invoice(db, invoice_id)
    if inv.contract_id is None:
        return
    prior_contract = str(inv.contract_id)
    inv.contract_id = None
    inv.vendor_id = None
    for m in db.scalars(select(Match).where(Match.invoice_id == inv.id, Match.confirmed.is_(True))):
        m.confirmed = False
        m.confirmed_by = None
    log_action(
        db,
        user_id=admin.id,
        action="match.unlock",
        entity_type="invoice",
        entity_id=inv.id,
        payload={"prior_contract_id": prior_contract},
    )
    db.commit()


@router.get("/{invoice_id}/matches", response_model=list[MatchOut])
def list_matches(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Match]:
    _load_invoice(db, invoice_id)
    return list(
        db.scalars(
            select(Match)
            .where(Match.invoice_id == invoice_id)
            .order_by(Match.confidence.desc())
        )
    )


@router.post("/{invoice_id}/map-boq", response_model=list[BoqMappingSuggestion])
def map_boq(
    invoice_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> list[BoqMappingSuggestion]:
    inv = _load_invoice(db, invoice_id)
    if inv.contract_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Confirm a contract match before mapping BoQ lines"
        )
    boq_items = list(
        db.scalars(
            select(BoqItem)
            .where(BoqItem.contract_id == inv.contract_id, BoqItem.active.is_(True))
            .order_by(BoqItem.line_number)
        )
    )
    lines = list(inv.line_items)
    if not lines:
        return []
    if not boq_items:
        raise HTTPException(status.HTTP_409_CONFLICT, "Contract has no active BoQ")

    invoice_lines_payload = [
        {
            "line_number": l.line_number or idx,
            "description": l.description,
            "uom": l.uom,
            "quantity": str(l.quantity),
            "unit_price": str(l.unit_price),
        }
        for idx, l in enumerate(lines, start=1)
    ]
    boq_payload = [
        {
            "line_number": b.line_number,
            "description": b.description,
            "uom": b.uom,
            "quantity": str(b.quantity),
            "unit_price": str(b.unit_price),
        }
        for b in boq_items
    ]

    suggestions = propose_mappings(db, inv.id, invoice_lines_payload, boq_payload)

    line_by_number = {l.line_number or idx: l for idx, l in enumerate(lines, start=1)}
    boq_by_number = {b.line_number: b for b in boq_items}
    out: list[BoqMappingSuggestion] = []
    for s in suggestions:
        li = line_by_number.get(s.invoice_line_number)
        if not li:
            continue
        bi = boq_by_number.get(s.boq_line_number) if s.boq_line_number is not None else None
        out.append(
            BoqMappingSuggestion(
                invoice_line_item_id=li.id,
                invoice_line_number=li.line_number,
                boq_item_id=bi.id if bi else None,
                boq_line_number=bi.line_number if bi else None,
                confidence=s.confidence,
                reason=s.reason,
            )
        )

    log_action(
        db,
        user_id=user.id,
        action="match.boq_suggestions",
        entity_type="invoice",
        entity_id=inv.id,
        payload={"suggestions": len(out)},
    )
    db.commit()
    return out


@router.post("/{invoice_id}/apply-boq-mapping", response_model=list[BoqMappingSuggestion])
def apply_boq_mapping(
    invoice_id: UUID,
    body: list[BoqMappingSuggestion],
    db: Session = Depends(get_db),
    user: User = Depends(require_officer_or_admin),
) -> list[BoqMappingSuggestion]:
    inv = _load_invoice(db, invoice_id)
    if inv.contract_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Invoice is not locked to a contract")

    line_map = {l.id: l for l in inv.line_items}
    applied: list[BoqMappingSuggestion] = []
    for row in body:
        li = line_map.get(row.invoice_line_item_id)
        if not li:
            continue
        if row.boq_item_id is None:
            li.boq_item_id = None
            li.not_in_boq = True
        else:
            bi = db.get(BoqItem, row.boq_item_id)
            if not bi or bi.contract_id != inv.contract_id:
                continue
            li.boq_item_id = bi.id
            li.not_in_boq = False
        li.mapping_confidence = row.confidence
        applied.append(row)

    log_action(
        db,
        user_id=user.id,
        action="match.boq_mapping_applied",
        entity_type="invoice",
        entity_id=inv.id,
        payload={"applied": len(applied)},
    )
    db.commit()
    return applied
