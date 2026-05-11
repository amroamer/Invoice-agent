from decimal import Decimal
from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_officer_or_admin
from app.api.projects import _summary_for
from app.models.enums import InvoiceStatus
from app.models.invoice import Invoice
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectSummary

if TYPE_CHECKING:
    pass

router = APIRouter()


class QueueCounts(BaseModel):
    pending: int = 0
    reviewed: int = 0
    decided: int = 0
    paid: int = 0
    partially_paid: int = 0
    rejected: int = 0


class DashboardStats(BaseModel):
    queue_counts: QueueCounts
    total_contract_value: Decimal
    total_invoiced: Decimal
    total_paid: Decimal
    active_projects: int
    active_vendors: int


@router.get("/projects", response_model=list[ProjectSummary])
def project_cards(
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[ProjectSummary]:
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_summary_for(db, p) for p in projects]


@router.get("/stats", response_model=DashboardStats)
def stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> DashboardStats:
    counts_rows = db.execute(
        select(Invoice.status, func.count(Invoice.id))
        .where(Invoice.archived.is_(False))
        .group_by(Invoice.status)
    ).all()
    by_status: dict[str, int] = {r[0].value: int(r[1]) for r in counts_rows}
    queue = QueueCounts(
        pending=by_status.get("pending", 0),
        reviewed=by_status.get("reviewed", 0),
        decided=by_status.get("decided", 0),
        paid=by_status.get("paid", 0),
        partially_paid=by_status.get("partially_paid", 0),
        rejected=by_status.get("rejected", 0),
    )

    from app.models.contract import Contract
    from app.models.payment import Payment
    from app.models.vendor import Vendor

    total_value = db.scalar(select(func.coalesce(func.sum(Contract.value), 0))) or Decimal("0")
    total_invoiced = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), 0)).where(
            Invoice.archived.is_(False), Invoice.status != InvoiceStatus.rejected
        )
    ) or Decimal("0")
    total_paid = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0))) or Decimal("0")
    active_projects = db.scalar(
        select(func.count(Project.id)).where(Project.status == "active")
    ) or 0
    active_vendors = db.scalar(
        select(func.count(Vendor.id)).where(Vendor.active.is_(True))
    ) or 0

    return DashboardStats(
        queue_counts=queue,
        total_contract_value=Decimal(total_value),
        total_invoiced=Decimal(total_invoiced),
        total_paid=Decimal(total_paid),
        active_projects=int(active_projects),
        active_vendors=int(active_vendors),
    )
