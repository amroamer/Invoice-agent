from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, new_uuid


class LlmCall(Base):
    __tablename__ = "llm_calls"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), index=True
    )
    agent: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    response: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
