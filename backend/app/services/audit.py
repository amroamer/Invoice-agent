from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def log_action(
    db: Session,
    *,
    user_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    row = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload_json=payload,
        ip=ip,
    )
    db.add(row)
    db.flush()
    return row
