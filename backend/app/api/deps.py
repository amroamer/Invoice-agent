from collections.abc import Generator
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import SessionLocal
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing credentials")
    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")
    try:
        user_id = UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad subject") from exc
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")
    return user


def require_officer_or_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in (UserRole.officer, UserRole.admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    return user
