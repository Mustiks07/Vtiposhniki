"""Conversations, checklists, registry, batches, jobs, attempts, calls, evaluations.

Revision ID: 0001
Revises:
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

STATEMENTS = [
    """
    CREATE TABLE import_runs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('json', 'organizer_api')),
        group_id TEXT,
        received_count INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE conversations (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        external_id TEXT NOT NULL UNIQUE,
        latest_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE conversation_revisions (
        conversation_id TEXT NOT NULL REFERENCES conversations (id),
        revision INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        channel TEXT NOT NULL,
        language TEXT NOT NULL,
        document_json TEXT NOT NULL,
        audio_source_url TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, revision)
    )
    """,
    """
    CREATE TABLE raw_import_records (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        import_id TEXT NOT NULL REFERENCES import_runs (id),
        source_index INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        raw_json TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        UNIQUE (import_id, source_index),
        FOREIGN KEY (conversation_id, revision)
            REFERENCES conversation_revisions (conversation_id, revision)
    )
    """,
    """
    CREATE TABLE checklists (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE checklist_versions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id TEXT NOT NULL UNIQUE,
        checklist_id TEXT NOT NULL REFERENCES checklists (id),
        title TEXT NOT NULL,
        semantic_hash TEXT NOT NULL,
        scoring_config_hash TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX ix_checklist_versions_checklist ON checklist_versions (checklist_id, seq)",
    """
    CREATE TABLE corpus_snapshots (
        id TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        document_json TEXT NOT NULL,
        registered_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE evaluator_profiles (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        version TEXT NOT NULL,
        corpus_snapshot_id TEXT NOT NULL REFERENCES corpus_snapshots (id),
        profile_hash TEXT NOT NULL,
        document_json TEXT NOT NULL,
        registered_at TEXT NOT NULL,
        UNIQUE (profile_id, version)
    )
    """,
    """
    CREATE TABLE batches (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL UNIQUE,
        request_fingerprint TEXT NOT NULL,
        checklist_version_id TEXT NOT NULL REFERENCES checklist_versions (version_id),
        profile_id TEXT NOT NULL,
        profile_version TEXT NOT NULL,
        corpus_snapshot_id TEXT NOT NULL REFERENCES corpus_snapshots (id),
        mode TEXT NOT NULL CHECK (mode IN ('fresh', 'reuse_if_compatible')),
        created_at TEXT NOT NULL,
        FOREIGN KEY (profile_id, profile_version)
            REFERENCES evaluator_profiles (profile_id, version)
    )
    """,
    """
    CREATE TABLE jobs (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        batch_id TEXT REFERENCES batches (id),
        conversation_id TEXT NOT NULL,
        conversation_revision INTEGER NOT NULL,
        checklist_version_id TEXT NOT NULL REFERENCES checklist_versions (version_id),
        profile_id TEXT NOT NULL,
        profile_version TEXT NOT NULL,
        corpus_snapshot_id TEXT NOT NULL REFERENCES corpus_snapshots (id),
        mode TEXT NOT NULL CHECK (mode IN ('fresh', 'reuse_if_compatible')),
        state TEXT NOT NULL CHECK (
            state IN ('queued', 'running', 'succeeded', 'retry_wait', 'failed', 'cancelled')
        ),
        max_attempts INTEGER NOT NULL,
        next_attempt_at TEXT,
        attempt_id TEXT,
        lease_id TEXT,
        lease_expires_at TEXT,
        deadline_at TEXT,
        max_provider_calls INTEGER,
        max_total_tokens INTEGER,
        max_cost TEXT,
        stage TEXT NOT NULL,
        evaluation_id TEXT,
        error_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id, conversation_revision)
            REFERENCES conversation_revisions (conversation_id, revision),
        FOREIGN KEY (profile_id, profile_version)
            REFERENCES evaluator_profiles (profile_id, version)
    )
    """,
    "CREATE INDEX ix_jobs_claim ON jobs (state, next_attempt_at, seq)",
    "CREATE INDEX ix_jobs_batch ON jobs (batch_id, seq)",
    "CREATE INDEX ix_jobs_conversation ON jobs (conversation_id, conversation_revision, seq)",
    """
    CREATE TABLE job_attempts (
        attempt_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs (id),
        number INTEGER NOT NULL,
        lease_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        state TEXT NOT NULL CHECK (
            state IN ('running', 'succeeded', 'failed', 'expired', 'cancelled')
        ),
        error_json TEXT,
        UNIQUE (job_id, number)
    )
    """,
    """
    CREATE TABLE provider_calls (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id TEXT NOT NULL UNIQUE,
        job_id TEXT NOT NULL REFERENCES jobs (id),
        attempt_id TEXT NOT NULL REFERENCES job_attempts (attempt_id),
        outcome TEXT NOT NULL,
        record_json TEXT NOT NULL
    )
    """,
    "CREATE INDEX ix_provider_calls_job ON provider_calls (job_id, seq)",
    """
    CREATE TABLE evaluations (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        job_id TEXT NOT NULL UNIQUE REFERENCES jobs (id),
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
    "CREATE INDEX ix_evaluations_reuse ON evaluations (reuse_key, status, seq)",
    "CREATE INDEX ix_evaluations_conversation ON evaluations (conversation_id, seq)",
    "CREATE INDEX ix_evaluations_batch ON evaluations (batch_id, seq)",
    # The automatic result is immutable at the storage level, not only by convention.
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
