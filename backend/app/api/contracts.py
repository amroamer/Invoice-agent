import os
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.core.config import get_settings
from app.models.contract import Contract
from app.models.user import User
from app.schemas.contract import ContractCreate, ContractCumulative, ContractDetail, ContractOut, ContractUpdate
from app.services.audit import log_action
from app.services.cumulative import contract_cumulative

router = APIRouter()


@router.get("", response_model=list[ContractOut])
def list_contracts(
    project_id: UUID | None = None,
    vendor_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> list[Contract]:
    q = db.query(Contract)
    if project_id:
        q = q.filter(Contract.project_id == project_id)
    if vendor_id:
        q = q.filter(Contract.vendor_id == vendor_id)
    return list(q.order_by(Contract.created_at.desc()).all())


@router.post("", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
def create_contract(
    body: ContractCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Contract:
    if body.end_date < body.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "end_date must be >= start_date")
    contract = Contract(**body.model_dump(), created_by=admin.id, updated_by=admin.id)
    db.add(contract)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Contract number already exists for this vendor"
        ) from exc
    log_action(
        db, user_id=admin.id, action="contract.create", entity_type="contract", entity_id=contract.id
    )
    db.commit()
    db.refresh(contract)
    return contract


@router.get("/{contract_id}", response_model=ContractDetail)
def get_contract(
    contract_id: UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> ContractDetail:
    contract = db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    cum = contract_cumulative(db, contract_id)
    return ContractDetail(
        **ContractOut.model_validate(contract).model_dump(),
        cumulative=ContractCumulative(**cum),
    )


@router.patch("/{contract_id}", response_model=ContractOut)
def update_contract(
    contract_id: UUID,
    body: ContractUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Contract:
    contract = db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contract, field, value)
    contract.updated_by = admin.id
    log_action(
        db,
        user_id=admin.id,
        action="contract.update",
        entity_type="contract",
        entity_id=contract.id,
        payload=body.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    db.refresh(contract)
    return contract


@router.post("/{contract_id}/file", response_model=ContractOut)
async def upload_contract_file(
    contract_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> Contract:
    contract = db.get(Contract, contract_id)
    if not contract:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contract not found")
    settings = get_settings()
    target_dir = os.path.join(settings.upload_dir, "contracts", str(contract.id))
    os.makedirs(target_dir, exist_ok=True)
    safe_name = f"{uuid4().hex}_{os.path.basename(file.filename or 'contract.pdf')}"
    path = os.path.join(target_dir, safe_name)
    with open(path, "wb") as out:
        out.write(await file.read())
    contract.contract_file_path = path
    log_action(
        db, user_id=admin.id, action="contract.file_upload", entity_type="contract", entity_id=contract.id
    )
    db.commit()
    db.refresh(contract)
    return contract
