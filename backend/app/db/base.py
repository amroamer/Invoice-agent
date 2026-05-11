from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AuditMixin(TimestampMixin):
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)


def new_uuid() -> UUID:
    return uuid4()
