"""Questions about pinned transcript and assessment; separate from decisions."""

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE conversation_questions (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL UNIQUE,
            evaluation_id TEXT NOT NULL REFERENCES evaluations (id),
            request_key TEXT NOT NULL UNIQUE,
            request_json TEXT NOT NULL,
            state TEXT NOT NULL CHECK (state IN ('running', 'succeeded', 'failed')),
            document_json TEXT NOT NULL,
            budget_json TEXT NOT NULL
        )
    """)
    op.execute(
        "CREATE UNIQUE INDEX ix_question_active ON conversation_questions (evaluation_id) WHERE state='running'"
    )


def downgrade() -> None:
    raise NotImplementedError("Advisory usage history must be preserved")
