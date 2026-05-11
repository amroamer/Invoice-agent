import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.core.security import create_token, decode_token, hash_password, verify_password  # noqa: E402


def test_password_hash_and_verify() -> None:
    pw = "CorrectHorseBatteryStaple!"
    h = hash_password(pw)
    assert h != pw
    assert verify_password(pw, h)
    assert not verify_password("wrong", h)


def test_token_roundtrip() -> None:
    tok = create_token("user-id-123", "access", {"role": "officer"})
    decoded = decode_token(tok)
    assert decoded["sub"] == "user-id-123"
    assert decoded["type"] == "access"
    assert decoded["role"] == "officer"
