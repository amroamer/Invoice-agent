from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.models.enums import Scenario
from app.schemas.common import ORMModel


class RecommendationOut(ORMModel):
    id: UUID
    invoice_id: UUID
    scenario: Scenario
    confidence: int
    justification: str
    deduction_amount: Decimal | None
    clarification_email: str | None
    generated_at: datetime


class GenerateResponse(BaseModel):
    recommendations: list[RecommendationOut]
    finding_count: int
    blocker_count: int
    warning_count: int
