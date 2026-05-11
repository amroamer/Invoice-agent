from datetime import date
from uuid import UUID

from sqlalchemy import Date, String, Text
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, new_uuid
from app.models.enums import ProjectStatus


class Project(Base, AuditMixin):
    __tablename__ = "projects"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    client_entity: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[ProjectStatus] = mapped_column(
        PgEnum(ProjectStatus, name="project_status"),
        nullable=False,
        default=ProjectStatus.active,
    )

    contracts = relationship("Contract", back_populates="project")
