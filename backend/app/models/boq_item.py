from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, new_uuid


class BoqItem(Base, AuditMixin):
    __tablename__ = "boq_items"
    __table_args__ = (
        UniqueConstraint("contract_id", "line_number", "active", name="uq_boq_contract_line_active"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    contract_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    uom: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    contract = relationship("Contract", back_populates="boq_items")
