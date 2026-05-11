from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, new_uuid


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    action: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), index=True)
    payload_json: Mapped[dict | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(64))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
