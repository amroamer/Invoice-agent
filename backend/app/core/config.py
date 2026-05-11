from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"

    database_url: str
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    jwt_secret: str
    jwt_access_ttl_seconds: int = 900
    jwt_refresh_ttl_seconds: int = 604800
    password_pepper: str = ""
    session_inactivity_minutes: int = 30
    max_failed_logins: int = 5

    ollama_host: str = "http://ollama:11434"
    ollama_model: str = "qwen2.5:7b"

    storage_backend: Literal["local", "azure_blob"] = "local"
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 20

    cors_origins: str = "http://localhost:5173,http://localhost"

    boq_total_tolerance_pct: float = 0.5
    unit_price_tolerance_pct: float = 0.0
    vat_rate: float = 0.15
    low_confidence_threshold: int = 70

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
