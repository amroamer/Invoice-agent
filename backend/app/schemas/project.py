from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ProjectStatus
from app.schemas.common import ORMModel


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    client_entity: str = Field(min_length=1, max_length=200)
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: ProjectStatus = ProjectStatus.active


class ProjectUpdate(BaseModel):
    name: str | None = None
    client_entity: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: ProjectStatus | None = None


class ProjectOut(ORMModel):
    id: UUID
    name: str
    client_entity: str
    description: str | None
    start_date: date | None
    end_date: date | None
    status: ProjectStatus
    created_at: datetime


class ProjectSummary(ProjectOut):
    total_contract_value: Decimal
    invoiced_to_date: Decimal
    paid_to_date: Decimal
    remaining: Decimal
    open_invoice_count: int
