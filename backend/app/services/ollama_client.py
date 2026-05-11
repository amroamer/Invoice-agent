"""Thin HTTP wrapper around a local Ollama server.

Every call is logged to the `llm_calls` table with prompt hash, latency, and
token counts (best-effort — Ollama doesn't always report tokens).
"""
from __future__ import annotations

import hashlib
import logging
import time
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.llm_call import LlmCall
from app.services import app_settings as app_settings_svc

log = logging.getLogger(__name__)


@dataclass
class OllamaResponse:
    text: str
    model: str
    prompt_tokens: int | None
    completion_tokens: int | None
    latency_ms: int


def _prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


def generate_json(
    db: Session,
    *,
    agent: str,
    system: str,
    prompt: str,
    invoice_id: UUID | None = None,
    temperature: float = 0.1,
    timeout_seconds: float = 120.0,
) -> OllamaResponse:
    settings = get_settings()
    full_prompt = f"{system}\n\n{prompt}"
    hashed = _prompt_hash(full_prompt)
    model = app_settings_svc.get(
        db, app_settings_svc.LLM_DEFAULT_MODEL_KEY, settings.ollama_model
    ) or settings.ollama_model
    url = f"{settings.ollama_host.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "format": "json",
        "options": {"temperature": temperature},
    }

    start = time.monotonic()
    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        latency_ms = int((time.monotonic() - start) * 1000)
        log.exception("ollama_error")
        db.add(
            LlmCall(
                invoice_id=invoice_id,
                agent=agent,
                model=model,
                prompt_hash=hashed,
                response=f"ERROR: {exc}",
                latency_ms=latency_ms,
            )
        )
        db.commit()
        raise

    latency_ms = int((time.monotonic() - start) * 1000)
    text = data.get("response", "")
    prompt_tokens = data.get("prompt_eval_count")
    completion_tokens = data.get("eval_count")

    db.add(
        LlmCall(
            invoice_id=invoice_id,
            agent=agent,
            model=model,
            prompt_hash=hashed,
            response=text[:50000],
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
    )
    db.commit()

    return OllamaResponse(
        text=text,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        latency_ms=latency_ms,
    )


def health(timeout_seconds: float = 5.0) -> dict[str, Any]:
    settings = get_settings()
    url = f"{settings.ollama_host.rstrip('/')}/api/tags"
    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            resp = client.get(url)
        resp.raise_for_status()
        return {"ok": True, "models": resp.json()}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
