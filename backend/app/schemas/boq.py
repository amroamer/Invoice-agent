from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class BoqItemIn(BaseModel):
    line_number: int = Field(ge=1)
    description: str = Field(min_length=1)
    uom: str = Field(min_length=1, max_length=32)
    quantity: Decimal = Field(ge=0)
    unit_price: Decimal = Field(ge=0)
    line_total: Decimal | None = None


class BoqItemOut(ORMModel):
    id: UUID
    contract_id: UUID
    line_number: int
    description: str
    uom: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    active: bool
    created_at: datetime


class BoqPreviewRow(BaseModel):
    line_number: int
    description: str
    uom: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    errors: list[str] = []


class BoqPreviewOut(BaseModel):
    rows: list[BoqPreviewRow]
    row_errors: int
    sum_line_total: Decimal
    contract_value: Decimal | None
    tolerance_pct: float
    within_tolerance: bool | None


class BoqCommitRequest(BaseModel):
    rows: list[BoqItemIn]


class BoqLineCumulative(BaseModel):
    id: UUID
    line_number: int
    description: str
    uom: str
    original_quantity: Decimal
    original_unit_price: Decimal
    original_line_total: Decimal
    cumulative_quantity_invoiced: Decimal
    cumulative_amount_invoiced: Decimal
    cumulative_amount_paid: Decimal
    remaining_quantity: Decimal
    remaining_value: Decimal
    consumed_pct: float
    color: str


class BoqLineHistoryEntry(BaseModel):
    invoice_id: UUID
    invoice_number: str
    invoice_date: str
    quantity: Decimal
    amount: Decimal
