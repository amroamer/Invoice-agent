from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_uuid
from app.models.enums import UserRole


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    full_name: Mapped[str | None] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        PgEnum(UserRole, name="user_role"), nullable=False, default=UserRole.officer
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
