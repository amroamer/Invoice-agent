from datetime import datetime
from uuid import UUID

from app.models.enums import FindingSeverity
from app.schemas.common import ORMModel


class FindingOut(ORMModel):
    id: UUID
    invoice_id: UUID
    rule_code: str
    severity: FindingSeverity
    message: str
    reference_json: dict | None
    created_at: datetime
