"""Separate advisory requests; no changes to evaluations or decisions."""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE second_opinions (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL UNIQUE,
            appeal_id TEXT NOT NULL REFERENCES appeals (id),
            request_key TEXT NOT NULL UNIQUE,
            state TEXT NOT NULL CHECK (state IN ('running', 'succeeded', 'failed')),
            document_json TEXT NOT NULL,
            budget_json TEXT NOT NULL
        )
    """)
    op.execute(
        "CREATE UNIQUE INDEX ix_second_opinion_active ON second_opinions (appeal_id) WHERE state = 'running'"
    )


def downgrade() -> None:
    raise NotImplementedError("Advisory call history must be preserved")
