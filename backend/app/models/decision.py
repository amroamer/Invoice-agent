from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_uuid
from app.models.enums import Scenario


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    invoice_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False
    )
    decided_by: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    scenario_accepted: Mapped[Scenario] = mapped_column(
        PgEnum(Scenario, name="scenario", create_type=False), nullable=False
    )
    override_reason: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    invoice = relationship("Invoice", back_populates="decisions")
