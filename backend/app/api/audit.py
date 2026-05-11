import csv
import io
import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.audit_log import AuditLog
from app.models.llm_call import LlmCall
from app.models.user import User
from app.schemas.common import ORMModel

router = APIRouter()


class AuditEntryOut(ORMModel):
    id: UUID
    user_id: UUID | None
    action: str
    entity_type: str
    entity_id: UUID | None
    payload_json: dict | None
    ip: str | None
    timestamp: datetime


class LlmCallOut(ORMModel):
    id: UUID
    invoice_id: UUID | None
    agent: str
    model: str
    prompt_hash: str
    response: str | None
    latency_ms: int
    prompt_tokens: int | None
    completion_tokens: int | None
    timestamp: datetime


class AuditActionBreakdown(ORMModel):
    action: str
    count: int


def _audit_query(
    db: Session,
    *,
    action: str | None,
    entity_type: str | None,
    user_id: UUID | None,
    since: datetime | None,
    until: datetime | None,
):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action == action)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if since:
        q = q.filter(AuditLog.timestamp >= since)
    if until:
        q = q.filter(AuditLog.timestamp <= until)
    return q


@router.get("/logs", response_model=list[AuditEntryOut])
def list_logs(
    action: str | None = None,
    entity_type: str | None = None,
    user_id: UUID | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[AuditLog]:
    q = _audit_query(
        db, action=action, entity_type=entity_type, user_id=user_id, since=since, until=until
    )
    return list(q.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all())


@router.get("/logs.csv")
def export_logs(
    action: str | None = None,
    entity_type: str | None = None,
    user_id: UUID | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=10000, le=50000),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> StreamingResponse:
    q = _audit_query(
        db, action=action, entity_type=entity_type, user_id=user_id, since=since, until=until
    )
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["timestamp", "user_id", "action", "entity_type", "entity_id", "ip", "payload_json"]
    )
    for row in q.order_by(AuditLog.timestamp.desc()).limit(limit):
        writer.writerow(
            [
                row.timestamp.isoformat(),
                str(row.user_id) if row.user_id else "",
                row.action,
                row.entity_type,
                str(row.entity_id) if row.entity_id else "",
                row.ip or "",
                json.dumps(row.payload_json, default=str) if row.payload_json else "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit_logs.csv"'},
    )


@router.get("/llm-calls", response_model=list[LlmCallOut])
def list_llm_calls(
    agent: str | None = None,
    invoice_id: UUID | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[LlmCall]:
    q = db.query(LlmCall)
    if agent:
        q = q.filter(LlmCall.agent == agent)
    if invoice_id:
        q = q.filter(LlmCall.invoice_id == invoice_id)
    if since:
        q = q.filter(LlmCall.timestamp >= since)
    if until:
        q = q.filter(LlmCall.timestamp <= until)
    return list(q.order_by(LlmCall.timestamp.desc()).offset(offset).limit(limit).all())


@router.get("/actions", response_model=list[AuditActionBreakdown])
def action_breakdown(
    since: datetime | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> list[AuditActionBreakdown]:
    stmt = select(AuditLog.action, func.count(AuditLog.id).label("count")).group_by(
        AuditLog.action
    )
    if since:
        stmt = stmt.where(AuditLog.timestamp >= since)
    rows = db.execute(stmt).all()
    return [AuditActionBreakdown(action=r.action, count=int(r.count)) for r in rows]
