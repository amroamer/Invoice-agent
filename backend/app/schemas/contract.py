from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ProjectStatus, VatTreatment
from app.schemas.common import ORMModel


class ContractCreate(BaseModel):
    project_id: UUID
    vendor_id: UUID
    contract_number: str = Field(min_length=1, max_length=120)
    value: Decimal = Field(gt=0)
    currency: str = Field(default="SAR", min_length=3, max_length=3)
    start_date: date
    end_date: date
    retention_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    advance_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    vat_treatment: VatTreatment = VatTreatment.exclusive
    status: ProjectStatus = ProjectStatus.active


class ContractUpdate(BaseModel):
    contract_number: str | None = None
    value: Decimal | None = None
    currency: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    retention_pct: Decimal | None = None
    advance_pct: Decimal | None = None
    vat_treatment: VatTreatment | None = None
    status: ProjectStatus | None = None


class ContractOut(ORMModel):
    id: UUID
    project_id: UUID
    vendor_id: UUID
    contract_number: str
    value: Decimal
    currency: str
    start_date: date
    end_date: date
    retention_pct: Decimal
    advance_pct: Decimal
    vat_treatment: VatTreatment
    status: ProjectStatus
    contract_file_path: str | None
    created_at: datetime


class ContractCumulative(BaseModel):
    invoiced_to_date: Decimal
    paid_to_date: Decimal
    approved_unpaid: Decimal
    remaining: Decimal
    consumed_pct: float


class ContractDetail(ContractOut):
    cumulative: ContractCumulative
