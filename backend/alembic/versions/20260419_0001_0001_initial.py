"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Use postgresql.ENUM with create_type=False for column types — they are created
# explicitly at the top of upgrade(). sa.Enum(..., create_type=False) does NOT
# suppress the implicit CREATE TYPE the postgresql dialect emits during
# CREATE TABLE, so we must use postgresql.ENUM directly here.
USER_ROLE = postgresql.ENUM(
    "officer", "admin", name="user_role", create_type=False
)
PROJECT_STATUS = postgresql.ENUM(
    "active", "on_hold", "closed", "inactive", name="project_status", create_type=False
)
VAT_TREATMENT = postgresql.ENUM(
    "inclusive", "exclusive", "exempt", name="vat_treatment", create_type=False
)
INVOICE_SOURCE = postgresql.ENUM(
    "historical", "uploaded", name="invoice_source", create_type=False
)
INVOICE_STATUS = postgresql.ENUM(
    "pending",
    "reviewed",
    "decided",
    "paid",
    "partially_paid",
    "rejected",
    name="invoice_status",
    create_type=False,
)
FINDING_SEVERITY = postgresql.ENUM(
    "info", "warning", "blocker", name="finding_severity", create_type=False
)
SCENARIO = postgresql.ENUM(
    "happy", "conditional", "do_not_pay", name="scenario", create_type=False
)


_ENUM_DEFS = (
    ("user_role", ("officer", "admin")),
    ("project_status", ("active", "on_hold", "closed", "inactive")),
    ("vat_treatment", ("inclusive", "exclusive", "exempt")),
    ("invoice_source", ("historical", "uploaded")),
    (
        "invoice_status",
        ("pending", "reviewed", "decided", "paid", "partially_paid", "rejected"),
    ),
    ("finding_severity", ("info", "warning", "blocker")),
    ("scenario", ("happy", "conditional", "do_not_pay")),
)


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in _ENUM_DEFS:
        postgresql.ENUM(*values, name=name).create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("username", sa.String(120), nullable=False),
        sa.Column("full_name", sa.String(200)),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", USER_ROLE, nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("failed_logins", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("last_login", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("username", name="uq_users_username"),
    )

    audit_cols = [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
    ]

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("client_entity", sa.String(200), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("start_date", sa.Date),
        sa.Column("end_date", sa.Date),
        sa.Column("status", PROJECT_STATUS, nullable=False, server_default="active"),
        *audit_cols,
    )
    op.create_index("ix_projects_name", "projects", ["name"])

    op.create_table(
        "vendors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("legal_name", sa.String(300), nullable=False),
        sa.Column("trn", sa.String(20), nullable=False),
        sa.Column("cr_number", sa.String(50)),
        sa.Column("bank_details", postgresql.JSONB),
        sa.Column("contact_email", sa.String(320)),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        *audit_cols,
        sa.UniqueConstraint("trn", name="uq_vendors_trn"),
    )
    op.create_index("ix_vendors_legal_name", "vendors", ["legal_name"])
    op.create_index("ix_vendors_trn", "vendors", ["trn"])

    op.create_table(
        "contracts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("contract_number", sa.String(120), nullable=False),
        sa.Column("value", sa.Numeric(18, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="SAR"),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("retention_pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("advance_pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("vat_treatment", VAT_TREATMENT, nullable=False, server_default="exclusive"),
        sa.Column("status", PROJECT_STATUS, nullable=False, server_default="active"),
        sa.Column("contract_file_path", sa.String(500)),
        *audit_cols,
        sa.UniqueConstraint("vendor_id", "contract_number", name="uq_contracts_vendor_number"),
    )
    op.create_index("ix_contracts_contract_number", "contracts", ["contract_number"])

    op.create_table(
        "boq_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("line_number", sa.Integer, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("uom", sa.String(32), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False),
        sa.Column("line_total", sa.Numeric(18, 2), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        *audit_cols,
    )
    op.create_index("ix_boq_items_contract_id", "boq_items", ["contract_id"])

    op.create_table(
        "invoices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="RESTRICT")),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vendors.id", ondelete="RESTRICT")),
        sa.Column("invoice_number", sa.String(120), nullable=False),
        sa.Column("invoice_date", sa.Date, nullable=False),
        sa.Column("subtotal", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("vat", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="SAR"),
        sa.Column("source", INVOICE_SOURCE, nullable=False),
        sa.Column("status", INVOICE_STATUS, nullable=False, server_default="pending"),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("original_file_path", sa.String(500)),
        *audit_cols,
    )
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"])
    op.create_index("ix_invoices_contract_id", "invoices", ["contract_id"])

    op.create_table(
        "invoice_line_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("boq_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("boq_items.id", ondelete="SET NULL")),
        sa.Column("line_number", sa.Integer),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("uom", sa.String(32)),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False),
        sa.Column("line_total", sa.Numeric(18, 2), nullable=False),
        sa.Column("mapping_confidence", sa.Integer),
        sa.Column("not_in_boq", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "extractions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("extracted_json", postgresql.JSONB, nullable=False),
        sa.Column("confidence_json", postgresql.JSONB),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("extracted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "matches",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("candidate_contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("confidence", sa.Integer, nullable=False),
        sa.Column("reasoning_json", postgresql.JSONB),
        sa.Column("confirmed", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("confirmed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rule_code", sa.String(64), nullable=False),
        sa.Column("severity", FINDING_SEVERITY, nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("reference_json", postgresql.JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_findings_rule_code", "findings", ["rule_code"])

    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scenario", SCENARIO, nullable=False),
        sa.Column("confidence", sa.Integer, nullable=False, server_default="0"),
        sa.Column("justification", sa.Text, nullable=False),
        sa.Column("deduction_amount", sa.Numeric(18, 2)),
        sa.Column("clarification_email", sa.Text),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("scenario_accepted", SCENARIO, nullable=False),
        sa.Column("override_reason", sa.Text),
        sa.Column("decided_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("payment_date", sa.Date, nullable=False),
        sa.Column("reference", sa.String(200), nullable=False),
        sa.Column("recorded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("entity_type", sa.String(80), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True)),
        sa.Column("payload_json", postgresql.JSONB),
        sa.Column("ip", sa.String(64)),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_entity_type", "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_entity_id", "audit_logs", ["entity_id"])
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])

    op.create_table(
        "llm_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL")),
        sa.Column("agent", sa.String(80), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("prompt_hash", sa.String(64), nullable=False),
        sa.Column("response", sa.Text),
        sa.Column("latency_ms", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prompt_tokens", sa.Integer),
        sa.Column("completion_tokens", sa.Integer),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_llm_calls_invoice_id", "llm_calls", ["invoice_id"])
    op.create_index("ix_llm_calls_agent", "llm_calls", ["agent"])
    op.create_index("ix_llm_calls_prompt_hash", "llm_calls", ["prompt_hash"])


def downgrade() -> None:
    for t in (
        "llm_calls",
        "audit_logs",
        "payments",
        "decisions",
        "recommendations",
        "findings",
        "matches",
        "extractions",
        "invoice_line_items",
        "invoices",
        "boq_items",
        "contracts",
        "vendors",
        "projects",
        "users",
    ):
        op.drop_table(t)
    bind = op.get_bind()
    for e in (SCENARIO, FINDING_SEVERITY, INVOICE_STATUS, INVOICE_SOURCE, VAT_TREATMENT, PROJECT_STATUS, USER_ROLE):
        e.drop(bind, checkfirst=True)
