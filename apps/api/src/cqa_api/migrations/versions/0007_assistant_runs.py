"""Advisory coaching requests and their independent usage ledger."""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE assistant_runs (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL UNIQUE,
            context_key TEXT NOT NULL,
            request_key TEXT NOT NULL UNIQUE,
            request_json TEXT NOT NULL,
            state TEXT NOT NULL CHECK (state IN ('running', 'succeeded', 'failed')),
            document_json TEXT NOT NULL,
            budget_json TEXT NOT NULL
        )
    """)
    op.execute(
        "CREATE UNIQUE INDEX ix_assistant_active ON assistant_runs (context_key) WHERE state='running'"
    )


def downgrade() -> None:
    raise NotImplementedError("Advisory usage history must be preserved")
