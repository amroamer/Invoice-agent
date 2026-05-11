from uuid import UUID

from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, new_uuid


class Vendor(Base, AuditMixin):
    __tablename__ = "vendors"
    __table_args__ = (UniqueConstraint("trn", name="uq_vendors_trn"),)

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    legal_name: Mapped[str] = mapped_column(String(300), nullable=False, index=True)
    trn: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    cr_number: Mapped[str | None] = mapped_column(String(50))
    bank_details: Mapped[dict | None] = mapped_column(JSONB)
    contact_email: Mapped[str | None] = mapped_column(String(320))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    contracts = relationship("Contract", back_populates="vendor")
