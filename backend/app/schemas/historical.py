from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import InvoiceStatus
from app.schemas.common import ORMModel


class HistoricalMappingIn(BaseModel):
    boq_line_number: int | None = None
    boq_item_id: UUID | None = None
    description: str | None = None
    quantity: Decimal = Field(ge=0)
    amount: Decimal = Field(ge=0)


class HistoricalInvoiceIn(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=120)
    vendor_trn: str | None = None
    vendor_id: UUID | None = None
    contract_number: str | None = None
    contract_id: UUID | None = None
    invoice_date: date
    subtotal: Decimal = Field(ge=0)
    vat: Decimal = Field(ge=0)
    total: Decimal = Field(gt=0)
    status: str = "unpaid"
    paid_amount: Decimal = Field(default=Decimal("0"), ge=0)
    payment_date: date | None = None
    payment_reference: str | None = None
    mappings: list[HistoricalMappingIn] = []


class HistoricalPreviewRow(BaseModel):
    invoice_number: str
    vendor_trn: str
    contract_number: str
    invoice_date: date
    subtotal: Decimal
    vat: Decimal
    total: Decimal
    status: str
    paid_amount: Decimal
    payment_date: date | None
    payment_reference: str | None
    errors: list[str] = []


class HistoricalMappingPreview(BaseModel):
    invoice_number: str
    boq_line_number: int
    quantity: Decimal
    amount: Decimal
    errors: list[str] = []


class HistoricalPreviewOut(BaseModel):
    invoices: list[HistoricalPreviewRow]
    mappings: list[HistoricalMappingPreview]
    row_errors: int
    unresolved_contracts: list[str] = []
    unresolved_vendors: list[str] = []
    unresolved_boq_lines: list[str] = []


class HistoricalCommitRequest(BaseModel):
    invoices: list[HistoricalInvoiceIn]


class HistoricalInvoiceOut(ORMModel):
    id: UUID
    contract_id: UUID | None
    vendor_id: UUID | None
    invoice_number: str
    invoice_date: date
    subtotal: Decimal
    vat: Decimal
    total: Decimal
    currency: str
    status: InvoiceStatus
    archived: bool
    superseded_by_id: UUID | None
    created_at: datetime


class HistoricalEditRequest(BaseModel):
    invoice_date: date | None = None
    subtotal: Decimal | None = None
    vat: Decimal | None = None
    total: Decimal | None = None
    status: str | None = None
    paid_amount: Decimal | None = None
    payment_date: date | None = None
    payment_reference: str | None = None
    mappings: list[HistoricalMappingIn] | None = None
