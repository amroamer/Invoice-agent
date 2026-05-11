from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import ORMModel


class SignalOut(BaseModel):
    name: str
    weight: int
    score: int
    note: str


class MatchCandidateOut(BaseModel):
    match_id: UUID
    contract_id: UUID
    project_id: UUID
    contract_number: str
    project_name: str
    vendor_name: str
    confidence: int
    signals: list[SignalOut]
    remaining_budget: Decimal
    invoiced_to_date: Decimal


class MatchConfirmRequest(BaseModel):
    match_id: UUID


class MatchOut(ORMModel):
    id: UUID
    invoice_id: UUID
    candidate_contract_id: UUID
    confidence: int
    reasoning_json: dict | None
    confirmed: bool
    confirmed_by: UUID | None
    created_at: datetime


class BoqMappingSuggestion(BaseModel):
    invoice_line_item_id: UUID
    invoice_line_number: int | None
    boq_item_id: UUID | None
    boq_line_number: int | None
    confidence: int
    reason: str = ""
