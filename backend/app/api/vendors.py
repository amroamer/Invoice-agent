from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.models.user import User
from app.models.vendor import Vendor
from app.schemas.vendor import VendorCreate, VendorOut, VendorUpdate
from app.services.audit import log_action

router = APIRouter()


@router.get("", response_model=list[VendorOut])
def list_vendors(
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Vendor]:
    return list(db.query(Vendor).order_by(Vendor.legal_name.asc()).all())


@router.post("", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
def create_vendor(
    body: VendorCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Vendor:
    vendor = Vendor(**body.model_dump(), created_by=admin.id, updated_by=admin.id)
    db.add(vendor)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "TRN already exists") from exc
    log_action(db, user_id=admin.id, action="vendor.create", entity_type="vendor", entity_id=vendor.id)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.get("/{vendor_id}", response_model=VendorOut)
def get_vendor(
    vendor_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> Vendor:
    vendor = db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found")
    return vendor


@router.patch("/{vendor_id}", response_model=VendorOut)
def update_vendor(
    vendor_id: UUID,
    body: VendorUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Vendor:
    vendor = db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(vendor, field, value)
    vendor.updated_by = admin.id
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "TRN already exists") from exc
    log_action(
        db,
        user_id=admin.id,
        action="vendor.update",
        entity_type="vendor",
        entity_id=vendor.id,
        payload=body.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    db.refresh(vendor)
    return vendor


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_vendor(
    vendor_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    vendor = db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vendor not found")
    vendor.active = False
    log_action(db, user_id=admin.id, action="vendor.deactivate", entity_type="vendor", entity_id=vendor.id)
    db.commit()
