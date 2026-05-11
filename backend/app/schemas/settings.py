from pydantic import BaseModel, Field


class OllamaModelInfo(BaseModel):
    name: str
    size: int | None = None
    digest: str | None = None
    modified_at: str | None = None
    parameter_size: str | None = None
    family: str | None = None


class LlmSettings(BaseModel):
    host: str
    default_model: str
    env_default_model: str


class LlmSettingsUpdate(BaseModel):
    default_model: str = Field(min_length=1, max_length=200)


class LlmConnectionTest(BaseModel):
    ok: bool
    host: str
    latency_ms: int | None = None
    model_count: int | None = None
    error: str | None = None
