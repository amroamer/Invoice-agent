from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid


class InvoiceLineItem(Base, TimestampMixin):
    __tablename__ = "invoice_line_items"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    boq_item_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("boq_items.id", ondelete="SET NULL")
    )
    line_number: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    uom: Mapped[str | None] = mapped_column(String(32))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    mapping_confidence: Mapped[int | None] = mapped_column(Integer)
    not_in_boq: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    invoice = relationship("Invoice", back_populates="line_items")
    boq_item = relationship("BoqItem")
