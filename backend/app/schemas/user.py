from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole
from app.schemas.common import ORMModel


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=120)
    full_name: str | None = None
    password: str = Field(min_length=10, max_length=200)
    role: UserRole = UserRole.officer


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    role: UserRole | None = None
    active: bool | None = None


class UserOut(ORMModel):
    id: UUID
    email: EmailStr
    username: str
    full_name: str | None
    role: UserRole
    active: bool
    last_login: datetime | None
    created_at: datetime
