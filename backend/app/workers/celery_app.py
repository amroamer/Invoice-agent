from celery import Celery

from app.core.config import get_settings

_settings = get_settings()

celery_app = Celery(
    "finance_invoicing",
    broker=_settings.celery_broker_url,
    backend=_settings.celery_result_backend,
)
celery_app.conf.task_track_started = True
celery_app.conf.task_time_limit = 600
celery_app.conf.task_soft_time_limit = 540
celery_app.autodiscover_tasks(["app.workers"])


@celery_app.task(name="ping")
def ping() -> str:
    return "pong"
