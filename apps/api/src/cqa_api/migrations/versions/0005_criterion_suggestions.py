"""Criterion design advice; creating advice never creates a checklist version."""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE criterion_suggestions (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL UNIQUE,
            request_key TEXT NOT NULL UNIQUE,
            request_json TEXT NOT NULL,
            state TEXT NOT NULL CHECK (state IN ('running', 'succeeded', 'failed')),
            document_json TEXT NOT NULL,
            budget_json TEXT NOT NULL
        )
    """)


def downgrade() -> None:
    raise NotImplementedError("Advisory usage history must be preserved")
