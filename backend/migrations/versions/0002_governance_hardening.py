"""Add hardening fields for installations created by the first schema revision.

Revision ID: 0002_governance_hardening
Revises: 0001_initial
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import UUID

revision = "0002_governance_hardening"
down_revision = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    request_columns = {column["name"] for column in inspector.get_columns("requests")}
    api_key_columns = {column["name"] for column in inspector.get_columns("api_keys")}
    usage_columns = {column["name"] for column in inspector.get_columns("usage_daily")}
    event_columns = {column["name"] for column in inspector.get_columns("events")}
    if "sequence" not in event_columns:
        op.add_column("events", sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"))
        op.create_index("ix_events_request_sequence", "events", ["request_id", "sequence"])
    if "password_reset_tokens" not in inspector.get_table_names():
        op.create_table(
            "password_reset_tokens",
            sa.Column("id", UUID(as_uuid=False), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=False), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
        op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"])
        op.create_index("ix_password_reset_tokens_expires_at", "password_reset_tokens", ["expires_at"])
    if "prompt_sanitized" not in request_columns:
        op.add_column("requests", sa.Column("prompt_sanitized", sa.Text(), nullable=False, server_default=""))
    if "default_use_case" not in api_key_columns:
        op.add_column("api_keys", sa.Column("default_use_case", sa.String(length=80), nullable=True))
    if "user_id" not in usage_columns:
        op.add_column("usage_daily", sa.Column("user_id", UUID(as_uuid=False), nullable=True))
        op.create_foreign_key("fk_usage_daily_user", "usage_daily", "users", ["user_id"], ["id"], ondelete="CASCADE")
        for constraint in inspect(bind).get_unique_constraints("usage_daily"):
            if constraint.get("name") == "uq_usage_daily":
                op.drop_constraint("uq_usage_daily", "usage_daily", type_="unique")
                break
        op.create_unique_constraint("uq_usage_daily", "usage_daily", ["tenant_id", "user_id", "day", "use_case"])


def downgrade() -> None:
    # The first revision is metadata-driven for fresh Postgres environments.
    # Keep this compatibility revision non-destructive; dropping the full schema
    # is handled by 0001_initial's downgrade.
    pass
