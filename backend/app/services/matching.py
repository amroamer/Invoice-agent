"""Score candidate (project, contract) matches for an uploaded invoice.

Signals (weighted out of 100):
  - contract_number (35):  extracted contract_reference or po_reference matches contract_number.
  - vendor         (30):   extracted vendor_trn matches exactly, else vendor_legal_name fuzzy.
  - project_ref    (15):   extracted project_reference fuzzy-matches Project.name.
  - amount_fit     (20):   invoice total fits within remaining contract budget.

Always returns the top 3 candidates, even if confidence is low — the Officer decides.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.contract import Contract
from app.models.enums import ProjectStatus
from app.models.invoice import Invoice
from app.services.cumulative import contract_cumulative
from app.services.text_similarity import contains, normalize, ratio

WEIGHT_CONTRACT_NUMBER = 35
WEIGHT_VENDOR = 30
WEIGHT_PROJECT = 15
WEIGHT_AMOUNT = 20


@dataclass
class SignalDetail:
    name: str
    weight: int
    score: int
    note: str


@dataclass
class MatchCandidate:
    contract_id: UUID
    project_id: UUID
    contract_number: str
    project_name: str
    vendor_name: str
    confidence: int
    signals: list[SignalDetail] = field(default_factory=list)
    remaining_budget: Decimal = Decimal("0")
    invoiced_to_date: Decimal = Decimal("0")


def _score(signal_name: str, weight: int, raw: float, note: str) -> SignalDetail:
    pts = max(0, min(weight, round(raw * weight)))
    return SignalDetail(name=signal_name, weight=weight, score=pts, note=note)


def _score_contract_number(fields: dict, contract: Contract) -> SignalDetail:
    cref = fields.get("contract_reference") or ""
    poref = fields.get("po_reference") or ""
    cn = contract.contract_number or ""
    if not cn:
        return _score("contract_number", WEIGHT_CONTRACT_NUMBER, 0, "no contract number on file")
    nc = normalize(cn)
    if normalize(cref) == nc or normalize(poref) == nc:
        return SignalDetail(
            name="contract_number",
            weight=WEIGHT_CONTRACT_NUMBER,
            score=WEIGHT_CONTRACT_NUMBER,
            note="exact match on contract or PO reference",
        )
    if contains(cn, cref) or contains(cn, poref):
        return SignalDetail(
            name="contract_number",
            weight=WEIGHT_CONTRACT_NUMBER,
            score=int(WEIGHT_CONTRACT_NUMBER * 0.85),
            note="contract number appears within invoice reference",
        )
    r = max(ratio(cref, cn), ratio(poref, cn))
    if r == 0:
        return _score("contract_number", WEIGHT_CONTRACT_NUMBER, 0, "no reference on invoice")
    return _score("contract_number", WEIGHT_CONTRACT_NUMBER, r, f"fuzzy ratio {r:.2f}")


def _score_vendor(fields: dict, contract: Contract) -> SignalDetail:
    vtrn = fields.get("vendor_trn") or ""
    vname = fields.get("vendor_legal_name") or ""
    if contract.vendor is None:
        return _score("vendor", WEIGHT_VENDOR, 0, "contract has no vendor linked")
    if vtrn and normalize(vtrn) == normalize(contract.vendor.trn or ""):
        return SignalDetail(
            name="vendor",
            weight=WEIGHT_VENDOR,
            score=WEIGHT_VENDOR,
            note="TRN exact match",
        )
    r = ratio(vname, contract.vendor.legal_name)
    if r == 0:
        return _score("vendor", WEIGHT_VENDOR, 0, "no vendor signal")
    # Name-only match caps below TRN exact
    capped = min(r, 0.85)
    return _score("vendor", WEIGHT_VENDOR, capped, f"name fuzzy ratio {r:.2f}")


def _score_project(fields: dict, contract: Contract) -> SignalDetail:
    pref = fields.get("project_reference") or ""
    if contract.project is None:
        return _score("project_reference", WEIGHT_PROJECT, 0, "no project linked")
    r = ratio(pref, contract.project.name)
    if r == 0:
        return _score("project_reference", WEIGHT_PROJECT, 0, "no project reference on invoice")
    return _score("project_reference", WEIGHT_PROJECT, r, f"fuzzy ratio {r:.2f}")


def _score_amount(invoice_total: Decimal, remaining: Decimal) -> SignalDetail:
    if invoice_total <= 0:
        return _score("amount_fit", WEIGHT_AMOUNT, 0, "invoice total unknown")
    if remaining <= 0:
        return _score("amount_fit", WEIGHT_AMOUNT, 0, "contract already fully consumed")
    if invoice_total <= remaining:
        return SignalDetail(
            name="amount_fit",
            weight=WEIGHT_AMOUNT,
            score=WEIGHT_AMOUNT,
            note=f"fits within remaining {remaining}",
        )
    ratio_fit = float(remaining / invoice_total)
    return _score(
        "amount_fit",
        WEIGHT_AMOUNT,
        max(0.0, min(1.0, ratio_fit)),
        f"over-budget ({remaining}/{invoice_total} = {ratio_fit:.2f})",
    )


def score_contract(fields: dict, invoice_total: Decimal, contract: Contract, remaining: Decimal) -> tuple[int, list[SignalDetail]]:
    signals = [
        _score_contract_number(fields, contract),
        _score_vendor(fields, contract),
        _score_project(fields, contract),
        _score_amount(invoice_total, remaining),
    ]
    total = sum(s.score for s in signals)
    return min(100, total), signals


def compute_candidates(
    db: Session,
    invoice: Invoice,
    fields: dict,
    limit: int = 3,
) -> list[MatchCandidate]:
    contracts: list[Contract] = list(
        db.scalars(
            select(Contract)
            .options(selectinload(Contract.vendor), selectinload(Contract.project))
            .where(Contract.status.in_([ProjectStatus.active, ProjectStatus.on_hold]))
        )
    )
    candidates: list[MatchCandidate] = []
    for contract in contracts:
        cum = contract_cumulative(db, contract.id, exclude_invoice_id=invoice.id)
        remaining = Decimal(cum["remaining"])
        confidence, signals = score_contract(
            fields, invoice.total, contract, remaining
        )
        candidates.append(
            MatchCandidate(
                contract_id=contract.id,
                project_id=contract.project_id,
                contract_number=contract.contract_number,
                project_name=contract.project.name if contract.project else "",
                vendor_name=contract.vendor.legal_name if contract.vendor else "",
                confidence=confidence,
                signals=signals,
                remaining_budget=remaining,
                invoiced_to_date=Decimal(cum["invoiced_to_date"]),
            )
        )
    candidates.sort(key=lambda c: c.confidence, reverse=True)
    return candidates[:limit]
