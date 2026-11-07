"""Appeals, append-only decisions and the private confirmation of audio access.

Revision ID: 0003
Revises: 0002
"""

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

STATEMENTS = [
    """
    CREATE TABLE appeals (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        evaluation_id TEXT NOT NULL REFERENCES evaluations (id),
        criterion_id TEXT NOT NULL,
        comment TEXT NOT NULL,
        effective_revision INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('open', 'resolved')),
        created_at TEXT NOT NULL
    )
    """,
    # One open appeal per criterion holds even under concurrent requests.
    "CREATE UNIQUE INDEX ux_appeals_one_open ON appeals (evaluation_id, criterion_id) "
    "WHERE state = 'open'",
    "CREATE INDEX ix_appeals_state ON appeals (state, seq)",
    "CREATE INDEX ix_appeals_evaluation ON appeals (evaluation_id, seq)",
    """
    CREATE TABLE decisions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        appeal_id TEXT NOT NULL UNIQUE REFERENCES appeals (id),
        evaluation_id TEXT NOT NULL REFERENCES evaluations (id),
        revision INTEGER NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (evaluation_id, revision)
    )
    """,
    """
    CREATE TRIGGER decisions_append_only_update BEFORE UPDATE ON decisions
    BEGIN
        SELECT RAISE(ABORT, 'decision history is append-only');
    END
    """,
    """
    CREATE TRIGGER decisions_append_only_delete BEFORE DELETE ON decisions
    BEGIN
        SELECT RAISE(ABORT, 'decision history is append-only');
    END
    """,
]


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Downgrades would risk user data; restore a backup instead")
