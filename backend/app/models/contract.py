from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, new_uuid
from app.models.enums import ProjectStatus, VatTreatment


class Contract(Base, AuditMixin):
    __tablename__ = "contracts"
    __table_args__ = (
        UniqueConstraint("vendor_id", "contract_number", name="uq_contracts_vendor_number"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    project_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    vendor_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False
    )
    contract_number: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="SAR")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    retention_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    advance_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    vat_treatment: Mapped[VatTreatment] = mapped_column(
        PgEnum(VatTreatment, name="vat_treatment"),
        nullable=False,
        default=VatTreatment.exclusive,
    )
    status: Mapped[ProjectStatus] = mapped_column(
        PgEnum(ProjectStatus, name="project_status", create_type=False),
        nullable=False,
        default=ProjectStatus.active,
    )
    contract_file_path: Mapped[str | None] = mapped_column(String(500))

    project = relationship("Project", back_populates="contracts")
    vendor = relationship("Vendor", back_populates="contracts")
    boq_items = relationship("BoqItem", back_populates="contract")
    invoices = relationship(
        "Invoice", back_populates="contract", foreign_keys="Invoice.contract_id"
    )
