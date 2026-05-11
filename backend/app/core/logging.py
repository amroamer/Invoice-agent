import logging
import sys
import uuid
from contextvars import ContextVar

from pythonjsonlogger import jsonlogger

from app.core.config import get_settings

correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="-")


class CorrelationFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = correlation_id_var.get()
        return True


def configure_logging() -> None:
    settings = get_settings()
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    fmt = jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(name)s %(correlation_id)s %(message)s",
        rename_fields={"asctime": "ts", "levelname": "level", "name": "logger"},
    )
    handler.setFormatter(fmt)
    handler.addFilter(CorrelationFilter())
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())

    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def new_correlation_id() -> str:
    cid = uuid.uuid4().hex
    correlation_id_var.set(cid)
    return cid


def set_correlation_id(cid: str) -> None:
    correlation_id_var.set(cid)


def get_correlation_id() -> str:
    return correlation_id_var.get()
