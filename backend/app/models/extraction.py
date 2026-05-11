from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_uuid


class Extraction(Base):
    __tablename__ = "extractions"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    extracted_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence_json: Mapped[dict | None] = mapped_column(JSONB)
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    invoice = relationship("Invoice", back_populates="extractions")
