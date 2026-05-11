"""Health + readiness endpoints.

`GET /health`       — cheap liveness probe, no dependency touches.
`GET /health/ready` — verifies Postgres, Redis, and Ollama are reachable.
`GET /health/detail` — admin-only, includes storage stats + recent error count.
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx
import redis as redis_lib
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.core.config import get_settings
from app.models.audit_log import AuditLog
from app.models.invoice import Invoice
from app.models.llm_call import LlmCall
from app.models.user import User

router = APIRouter()


def _check_postgres(db: Session) -> dict[str, Any]:
    t0 = time.monotonic()
    try:
        db.execute(text("SELECT 1"))
        return {"ok": True, "latency_ms": int((time.monotonic() - t0) * 1000)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}


def _check_redis() -> dict[str, Any]:
    settings = get_settings()
    t0 = time.monotonic()
    try:
        client = redis_lib.Redis.from_url(settings.redis_url, socket_timeout=3)
        client.ping()
        return {"ok": True, "latency_ms": int((time.monotonic() - t0) * 1000)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}


def _check_ollama() -> dict[str, Any]:
    settings = get_settings()
    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{settings.ollama_host.rstrip('/')}/api/tags")
        resp.raise_for_status()
        tags = resp.json()
        models = [m.get("name") for m in tags.get("models") or []]
        return {
            "ok": True,
            "latency_ms": int((time.monotonic() - t0) * 1000),
            "model": settings.ollama_model,
            "model_present": settings.ollama_model in (models or []),
            "models": models,
        }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)[:300]}


@router.get("", include_in_schema=False)
@router.get("/")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def readiness(response: Response, db: Session = Depends(get_db)) -> dict[str, Any]:
    checks = {
        "postgres": _check_postgres(db),
        "redis": _check_redis(),
        "ollama": _check_ollama(),
    }
    all_ok = all(c.get("ok") for c in checks.values())
    if not all_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"ok": all_ok, "checks": checks}


@router.get("/detail")
def detail(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> dict[str, Any]:
    settings = get_settings()

    def _dir_stats(path: str) -> dict[str, Any]:
        if not os.path.isdir(path):
            return {"exists": False, "path": path}
        files = 0
        size = 0
        for dirpath, _dirs, filenames in os.walk(path):
            for f in filenames:
                p = os.path.join(dirpath, f)
                try:
                    size += os.path.getsize(p)
                    files += 1
                except OSError:
                    continue
        return {
            "exists": True,
            "path": path,
            "file_count": files,
            "total_size_bytes": size,
        }

    invoice_total = db.scalar(select(Invoice.id).where(Invoice.archived.is_(False)).limit(1))
    audit_total = db.scalar(select(AuditLog.id).limit(1))
    llm_total = db.scalar(select(LlmCall.id).limit(1))

    return {
        "app_env": settings.app_env,
        "version": "0.1.0",
        "checks": {
            "postgres": _check_postgres(db),
            "redis": _check_redis(),
            "ollama": _check_ollama(),
        },
        "storage": _dir_stats(settings.upload_dir),
        "db_rows_seen": {
            "invoices": bool(invoice_total),
            "audit_logs": bool(audit_total),
            "llm_calls": bool(llm_total),
        },
        "config": {
            "max_upload_mb": settings.max_upload_mb,
            "storage_backend": settings.storage_backend,
            "session_inactivity_minutes": settings.session_inactivity_minutes,
            "max_failed_logins": settings.max_failed_logins,
            "ollama_model": settings.ollama_model,
            "vat_rate": settings.vat_rate,
            "low_confidence_threshold": settings.low_confidence_threshold,
        },
    }
