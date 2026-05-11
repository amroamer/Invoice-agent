from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.audit import log_action

router = APIRouter()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[User]:
    return list(db.query(User).order_by(User.created_at.desc()).all())


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    if db.query(User).filter((User.email == body.email) | (User.username == body.username)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "User with email or username already exists")
    user = User(
        email=body.email,
        username=body.username,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.flush()
    log_action(db, user_id=admin.id, action="user.create", entity_type="user", entity_id=user.id)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: UUID,
    body: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    log_action(
        db,
        user_id=admin.id,
        action="user.update",
        entity_type="user",
        entity_id=user.id,
        payload=body.model_dump(exclude_unset=True, mode="json"),
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.active = False
    log_action(db, user_id=admin.id, action="user.deactivate", entity_type="user", entity_id=user.id)
    db.commit()
