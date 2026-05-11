"""add archived + superseded_by_id to invoices for historical invoice versioning

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-20
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "invoices",
        sa.Column(
            "superseded_by_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("invoices.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_invoices_contract_active",
        "invoices",
        ["contract_id", "archived"],
    )


def downgrade() -> None:
    op.drop_index("ix_invoices_contract_active", table_name="invoices")
    op.drop_column("invoices", "superseded_by_id")
    op.drop_column("invoices", "archived")
