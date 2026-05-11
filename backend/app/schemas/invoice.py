from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import InvoiceSource, InvoiceStatus
from app.schemas.common import ORMModel


class InvoiceLineItemOut(ORMModel):
    id: UUID
    line_number: int | None
    boq_item_id: UUID | None
    description: str
    uom: str | None
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal
    mapping_confidence: int | None
    not_in_boq: bool


class InvoiceLineItemIn(BaseModel):
    id: UUID | None = None
    line_number: int | None = None
    boq_item_id: UUID | None = None
    description: str
    uom: str | None = None
    quantity: Decimal = Field(ge=0)
    unit_price: Decimal = Field(ge=0)
    line_total: Decimal = Field(ge=0)
    not_in_boq: bool = False


class InvoiceOut(ORMModel):
    id: UUID
    contract_id: UUID | None
    vendor_id: UUID | None
    invoice_number: str
    invoice_date: date
    subtotal: Decimal
    vat: Decimal
    total: Decimal
    currency: str
    source: InvoiceSource
    status: InvoiceStatus
    archived: bool
    original_file_path: str | None
    created_at: datetime
    line_items: list[InvoiceLineItemOut] = []


class InvoiceUploadResponse(BaseModel):
    invoice_id: UUID
    task_id: str | None
    original_name: str
    size_bytes: int


class ExtractionOut(ORMModel):
    id: UUID
    invoice_id: UUID
    extracted_json: dict
    confidence_json: dict | None
    model: str
    extracted_at: datetime


class InvoiceUpdate(BaseModel):
    invoice_number: str | None = None
    invoice_date: date | None = None
    subtotal: Decimal | None = None
    vat: Decimal | None = None
    total: Decimal | None = None
    currency: str | None = None
    vendor_id: UUID | None = None
    line_items: list[InvoiceLineItemIn] | None = None
    fields: dict | None = None
