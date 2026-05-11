from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class VendorCreate(BaseModel):
    legal_name: str = Field(min_length=1, max_length=300)
    trn: str = Field(min_length=5, max_length=20)
    cr_number: str | None = None
    bank_details: dict | None = None
    contact_email: EmailStr | None = None


class VendorUpdate(BaseModel):
    legal_name: str | None = None
    trn: str | None = None
    cr_number: str | None = None
    bank_details: dict | None = None
    contact_email: EmailStr | None = None
    active: bool | None = None


class VendorOut(ORMModel):
    id: UUID
    legal_name: str
    trn: str
    cr_number: str | None
    bank_details: dict | None
    contact_email: EmailStr | None
    active: bool
    created_at: datetime
