"""Retry history: private attempt diagnostics, several failed results per job.

A manual retry can follow a failed result, so a job may keep failed evaluations
while holding at most one non-failed result. SQLite cannot drop a table-level
UNIQUE, hence the rebuild; every existing row is copied.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

COLUMNS = (
    "seq, id, job_id, batch_id, conversation_id, conversation_revision, checklist_version_id, "
    "profile_id, profile_version, corpus_snapshot_id, status, revision, artifact_json, "
    "automatic_score_json, effective_proposals_json, effective_score_json, reuse_mode, "
    "reused_from, reuse_key, created_at"
)

STATEMENTS = [
    "ALTER TABLE job_attempts ADD COLUMN diagnostic_json TEXT",
    "DROP TRIGGER evaluations_automatic_immutable",
    """
    CREATE TABLE evaluations_new (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        job_id TEXT NOT NULL REFERENCES jobs (id),
        batch_id TEXT REFERENCES batches (id),
        conversation_id TEXT NOT NULL,
        conversation_revision INTEGER NOT NULL,
        checklist_version_id TEXT NOT NULL REFERENCES checklist_versions (version_id),
        profile_id TEXT NOT NULL,
        profile_version TEXT NOT NULL,
        corpus_snapshot_id TEXT NOT NULL REFERENCES corpus_snapshots (id),
        status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'failed')),
        revision INTEGER NOT NULL,
        artifact_json TEXT NOT NULL,
        automatic_score_json TEXT NOT NULL,
        effective_proposals_json TEXT NOT NULL,
        effective_score_json TEXT NOT NULL,
        reuse_mode TEXT NOT NULL,
        reused_from TEXT,
        reuse_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id, conversation_revision)
            REFERENCES conversation_revisions (conversation_id, revision)
    )
    """,
    f"INSERT INTO evaluations_new ({COLUMNS}) SELECT {COLUMNS} FROM evaluations",
    "DROP TABLE evaluations",
    "ALTER TABLE evaluations_new RENAME TO evaluations",
    "CREATE INDEX ix_evaluations_reuse ON evaluations (reuse_key, status, seq)",
    "CREATE INDEX ix_evaluations_conversation ON evaluations (conversation_id, seq)",
    "CREATE INDEX ix_evaluations_batch ON evaluations (batch_id, seq)",
    "CREATE UNIQUE INDEX ux_evaluations_job_result ON evaluations (job_id) "
    "WHERE status != 'failed'",
    """
    CREATE TRIGGER evaluations_automatic_immutable
    BEFORE UPDATE OF artifact_json, automatic_score_json ON evaluations
    BEGIN
        SELECT RAISE(ABORT, 'automatic evaluation result is immutable');
    END
    """,
]


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    raise NotImplementedError("Downgrades would risk user data; restore a backup instead")
