import logging
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.core.config import get_settings
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import PasswordChangeRequest, RefreshRequest, TokenPair
from app.services.audit import log_action

router = APIRouter()
log = logging.getLogger(__name__)


@router.post("/login", response_model=TokenPair)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    request: Request = None,  # type: ignore[assignment]
) -> TokenPair:
    settings = get_settings()
    user = db.query(User).filter(User.username == form.username).one_or_none()
    if user and user.locked_until and user.locked_until > datetime.now(UTC):
        raise HTTPException(status.HTTP_423_LOCKED, "Account temporarily locked")

    if not user or not verify_password(form.password, user.password_hash):
        if user:
            user.failed_logins += 1
            if user.failed_logins >= settings.max_failed_logins:
                user.locked_until = datetime.now(UTC) + timedelta(minutes=15)
                user.failed_logins = 0
            db.commit()
            log_action(
                db,
                user_id=user.id,
                action="auth.login_failed",
                entity_type="user",
                entity_id=user.id,
                ip=request.client.host if request and request.client else None,
            )
            db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    if not user.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account inactive")

    user.failed_logins = 0
    user.last_login = datetime.now(UTC)
    log_action(
        db,
        user_id=user.id,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        ip=request.client.host if request and request.client else None,
    )
    db.commit()

    return TokenPair(
        access_token=create_token(str(user.id), "access", {"role": user.role.value}),
        refresh_token=create_token(str(user.id), "refresh"),
    )


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenPair:
    try:
        payload = decode_token(body.refresh_token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    sub = payload.get("sub")
    user = db.query(User).filter(User.id == sub, User.active.is_(True)).one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive")
    return TokenPair(
        access_token=create_token(str(user.id), "access", {"role": user.role.value}),
        refresh_token=create_token(str(user.id), "refresh"),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    request: Request = None,  # type: ignore[assignment]
) -> None:
    log_action(
        db,
        user_id=user.id,
        action="auth.logout",
        entity_type="user",
        entity_id=user.id,
        ip=request.client.host if request and request.client else None,
    )
    db.commit()


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: PasswordChangeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password incorrect")
    user.password_hash = hash_password(body.new_password)
    log_action(db, user_id=user.id, action="auth.password_change", entity_type="user", entity_id=user.id)
    db.commit()
