import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin, require_officer_or_admin
from app.core.config import get_settings
from app.models.user import User
from app.schemas.settings import (
    LlmConnectionTest,
    LlmSettings,
    LlmSettingsUpdate,
    OllamaModelInfo,
)
from app.services import app_settings as app_settings_svc
from app.services.audit import log_action

router = APIRouter()


def _active_model(db: Session) -> str:
    settings = get_settings()
    return (
        app_settings_svc.get(db, app_settings_svc.LLM_DEFAULT_MODEL_KEY, settings.ollama_model)
        or settings.ollama_model
    )


def _ollama_get(path: str, timeout: float = 5.0) -> Any:
    settings = get_settings()
    url = f"{settings.ollama_host.rstrip('/')}{path}"
    with httpx.Client(timeout=timeout) as client:
        resp = client.get(url)
    resp.raise_for_status()
    return resp.json()


@router.get("/llm", response_model=LlmSettings)
def get_llm_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_officer_or_admin),
) -> LlmSettings:
    settings = get_settings()
    return LlmSettings(
        host=settings.ollama_host,
        default_model=_active_model(db),
        env_default_model=settings.ollama_model,
    )


@router.put("/llm", response_model=LlmSettings)
def update_llm_settings(
    body: LlmSettingsUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> LlmSettings:
    settings = get_settings()
    try:
        data = _ollama_get("/api/tags")
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Cannot reach Ollama at {settings.ollama_host}: {exc}"
        ) from exc
    available = {m.get("name") for m in (data.get("models") or [])}
    if body.default_model not in available:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Model '{body.default_model}' not available on {settings.ollama_host}",
        )
    app_settings_svc.set_value(db, app_settings_svc.LLM_DEFAULT_MODEL_KEY, body.default_model)
    log_action(
        db,
        user_id=admin.id,
        action="settings.llm.update",
        entity_type="app_setting",
        entity_id=None,
        payload={"default_model": body.default_model},
    )
    db.commit()
    return LlmSettings(
        host=settings.ollama_host,
        default_model=body.default_model,
        env_default_model=settings.ollama_model,
    )


@router.get("/llm/models", response_model=list[OllamaModelInfo])
def list_llm_models(
    _: User = Depends(require_officer_or_admin),
) -> list[OllamaModelInfo]:
    settings = get_settings()
    try:
        data = _ollama_get("/api/tags")
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"Cannot reach Ollama at {settings.ollama_host}: {exc}"
        ) from exc
    out: list[OllamaModelInfo] = []
    for m in data.get("models") or []:
        details = m.get("details") or {}
        out.append(
            OllamaModelInfo(
                name=m.get("name", ""),
                size=m.get("size"),
                digest=m.get("digest"),
                modified_at=m.get("modified_at"),
                parameter_size=details.get("parameter_size"),
                family=details.get("family"),
            )
        )
    return out


@router.post("/llm/test", response_model=LlmConnectionTest)
def test_llm_connection(
    _: User = Depends(require_officer_or_admin),
) -> LlmConnectionTest:
    settings = get_settings()
    started = time.monotonic()
    try:
        data = _ollama_get("/api/tags")
    except (httpx.HTTPError, ValueError) as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        return LlmConnectionTest(
            ok=False,
            host=settings.ollama_host,
            latency_ms=latency_ms,
            error=str(exc),
        )
    latency_ms = int((time.monotonic() - started) * 1000)
    return LlmConnectionTest(
        ok=True,
        host=settings.ollama_host,
        latency_ms=latency_ms,
        model_count=len(data.get("models") or []),
    )
