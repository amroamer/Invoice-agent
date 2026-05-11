from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, new_uuid
from app.models.enums import InvoiceSource, InvoiceStatus


class Invoice(Base, AuditMixin):
    __tablename__ = "invoices"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    contract_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("contracts.id", ondelete="RESTRICT")
    )
    vendor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT")
    )
    invoice_number: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    vat: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SAR")
    source: Mapped[InvoiceSource] = mapped_column(
        PgEnum(InvoiceSource, name="invoice_source"), nullable=False
    )
    status: Mapped[InvoiceStatus] = mapped_column(
        PgEnum(InvoiceStatus, name="invoice_status"),
        nullable=False,
        default=InvoiceStatus.pending,
    )
    uploaded_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), ForeignKey("users.id"))
    original_file_path: Mapped[str | None] = mapped_column(String(500))
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    superseded_by_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL")
    )

    contract = relationship("Contract", back_populates="invoices", foreign_keys=[contract_id])
    line_items = relationship(
        "InvoiceLineItem", back_populates="invoice", cascade="all, delete-orphan"
    )
    extractions = relationship("Extraction", back_populates="invoice")
    matches = relationship("Match", back_populates="invoice")
    findings = relationship("Finding", back_populates="invoice")
    recommendations = relationship("Recommendation", back_populates="invoice")
    decisions = relationship("Decision", back_populates="invoice")
    payments = relationship("Payment", back_populates="invoice")
