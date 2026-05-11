from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.models.contract import Contract
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.project import Project
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectOut, ProjectSummary, ProjectUpdate
from app.services.audit import log_action

router = APIRouter()


def _summary_for(db: Session, p: Project) -> ProjectSummary:
    total_value = db.scalar(
        select(func.coalesce(func.sum(Contract.value), 0)).where(Contract.project_id == p.id)
    ) or Decimal("0")

    invoiced = db.scalar(
        select(func.coalesce(func.sum(Invoice.total), 0))
        .join(Contract, Contract.id == Invoice.contract_id)
        .where(Contract.project_id == p.id)
    ) or Decimal("0")

    paid = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .join(Invoice, Invoice.id == Payment.invoice_id)
        .join(Contract, Contract.id == Invoice.contract_id)
        .where(Contract.project_id == p.id)
    ) or Decimal("0")

    open_count = db.scalar(
        select(func.count(Invoice.id))
        .join(Contract, Contract.id == Invoice.contract_id)
        .where(Contract.project_id == p.id, Invoice.status != "paid")
    ) or 0

    return ProjectSummary(
        **ProjectOut.model_validate(p).model_dump(),
        total_contract_value=Decimal(total_value),
        invoiced_to_date=Decimal(invoiced),
        paid_to_date=Decimal(paid),
        remaining=Decimal(total_value) - Decimal(invoiced),
        open_invoice_count=int(open_count),
    )


@router.get("", response_model=list[ProjectSummary])
def list_projects(
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[ProjectSummary]:
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_summary_for(db, p) for p in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Project:
    project = Project(**body.model_dump(), created_by=admin.id, updated_by=admin.id)
    db.add(project)
    db.flush()
    log_action(db, user_id=admin.id, action="project.create", entity_type="project", entity_id=project.id)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectSummary)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> ProjectSummary:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return _summary_for(db, project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    project.updated_by = admin.id
    log_action(
        db,
        user_id=admin.id,
        action="project.update",
        entity_type="project",
        entity_id=project.id,
        payload=body.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    if db.query(Contract).filter(Contract.project_id == project_id).count() > 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Cannot delete project with linked contracts"
        )
    db.delete(project)
    log_action(db, user_id=admin.id, action="project.delete", entity_type="project", entity_id=project.id)
    db.commit()
