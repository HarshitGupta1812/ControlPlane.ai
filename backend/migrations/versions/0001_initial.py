"""Create the ControlPlane event-sourced schema.

Revision ID: 0001_initial
Revises:
"""
from collections.abc import Sequence

from alembic import op

from app.db.models import Base

revision = "0001_initial"
down_revision = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The declarative model is the canonical schema. Keeping this migration
    # metadata-driven ensures new Postgres environments get all FK/indexes in
    # one audited revision while subsequent policy changes remain versioned.
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
