from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class PaymentIn(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_date: date
    reference: str = Field(min_length=1, max_length=200)


class PaymentOut(ORMModel):
    id: UUID
    invoice_id: UUID
    amount: Decimal
    payment_date: date
    reference: str
    recorded_by: UUID
    created_at: datetime
