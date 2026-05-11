from sqlalchemy.orm import Session

from app.models.app_setting import AppSetting

LLM_DEFAULT_MODEL_KEY = "llm.default_model"


def get(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.get(AppSetting, key)
    return row.value if row else default


def set_value(db: Session, key: str, value: str) -> AppSetting:
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.flush()
    return row
