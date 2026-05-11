from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, new_uuid
from app.models.enums import FindingSeverity


class Finding(Base, TimestampMixin):
    __tablename__ = "findings"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    rule_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[FindingSeverity] = mapped_column(
        PgEnum(FindingSeverity, name="finding_severity"), nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    reference_json: Mapped[dict | None] = mapped_column(JSONB)

    invoice = relationship("Invoice", back_populates="findings")
