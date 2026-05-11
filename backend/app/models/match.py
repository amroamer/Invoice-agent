from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


class Match(Base, TimestampMixin):
    __tablename__ = "matches"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    candidate_contract_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False
    )
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    reasoning_json: Mapped[dict | None] = mapped_column(JSONB)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confirmed_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), ForeignKey("users.id"))

    invoice = relationship("Invoice", back_populates="matches")
