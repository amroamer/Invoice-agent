from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()
_JWT_ALG = "HS256"


def hash_password(password: str) -> str:
    settings = get_settings()
    return _hasher.hash(password + settings.password_pepper)


def verify_password(password: str, hashed: str) -> bool:
    settings = get_settings()
    try:
        return _hasher.verify(hashed, password + settings.password_pepper)
    except VerifyMismatchError:
        return False


def create_token(
    subject: str,
    kind: Literal["access", "refresh"],
    extra: dict[str, Any] | None = None,
) -> str:
    settings = get_settings()
    ttl = settings.jwt_access_ttl_seconds if kind == "access" else settings.jwt_refresh_ttl_seconds
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": kind,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=_JWT_ALG)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[_JWT_ALG])
