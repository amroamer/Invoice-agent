from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str] = mapped_column(String(200), nullable=False)
    recorded_by: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    invoice = relationship("Invoice", back_populates="payments")
