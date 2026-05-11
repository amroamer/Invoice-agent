from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import Scenario
from app.schemas.common import ORMModel


class DecisionIn(BaseModel):
    scenario_accepted: Scenario
    override_reason: str | None = Field(default=None, max_length=2000)


class DecisionOut(ORMModel):
    id: UUID
    invoice_id: UUID
    decided_by: UUID
    scenario_accepted: Scenario
    override_reason: str | None
    decided_at: datetime
