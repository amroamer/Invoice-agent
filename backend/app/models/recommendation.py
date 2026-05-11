from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_uuid
from app.models.enums import Scenario


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    scenario: Mapped[Scenario] = mapped_column(PgEnum(Scenario, name="scenario"), nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    deduction_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))
    clarification_email: Mapped[str | None] = mapped_column(Text)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    invoice = relationship("Invoice", back_populates="recommendations")
