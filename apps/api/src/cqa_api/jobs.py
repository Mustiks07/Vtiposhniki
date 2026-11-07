"""Durable job state: batches, attempts, leases, the shared budget and call records.

Every function here is one short write transaction. No network IO happens inside.
"""

import hashlib
import json
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from cqa_contracts.http_models import BatchProgress, CreateBatch, EvaluationBatch
from cqa_contracts.interfaces import BudgetExceeded, LeaseLost, ObserverPersistenceError
from cqa_contracts.models import (
    APIError,
    CallEvent,
    CallRecord,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    ErrorCode,
    ErrorDetail,
    EvaluationArtifact,
    EvaluatorProfile,
    ExecutionBudget,
    Job,
    JobAttempt,
    JobProgress,
    ReuseProvenance,
    ScoreSummary,
)
from sqlalchemy import Connection, RowMapping

from .checklists import pinned_checklist
from .conversations import pinned_conversation
from .db import Database, from_wire_time, row, rows, run, to_wire_time
from .errors import ApiFailure, make_error, not_found
from .registry import latest_profile, pinned_corpus, pinned_profile, profile_configuration_error
from .services import Clock, Services


@dataclass(frozen=True)
class Claim:
    job_id: str
    attempt_id: str
    lease_id: str
    number: int


@dataclass(frozen=True)
class ExecutionInputs:
    conversation: Conversation
    checklist: ChecklistVersion
    profile: EvaluatorProfile
    corpus: CorpusSnapshot
    budget: ExecutionBudget
    mode: str
    batch_id: str | None


@dataclass(frozen=True)
class Usage:
    """Observed consumption. Unknown stays unknown: it is never added as zero."""

    calls: int
    tokens: int | None
    tokens_complete: bool
    cost: Decimal | None
    cost_complete: bool


def _record_tokens(record: CallRecord) -> int | None:
    usage = record.usage
    if usage is None or usage.input_tokens is None or usage.output_tokens is None:
        return None
    return usage.input_tokens + usage.output_tokens + (usage.reasoning_tokens or 0)


def summarize_usage(records: Sequence[CallRecord]) -> Usage:
    tokens = [_record_tokens(r) for r in records]
    known_tokens = [t for t in tokens if t is not None]
    known_costs = [r.cost for r in records if r.cost is not None]
    if not records:
        return Usage(0, 0, True, Decimal("0"), True)
    return Usage(
        calls=len(records),
        tokens=sum(known_tokens) if known_tokens else None,
        tokens_complete=len(known_tokens) == len(records),
        cost=sum(known_costs, Decimal("0")) if known_costs else None,
        cost_complete=len(known_costs) == len(records),
    )


def call_records(conn: Connection, job_id: str) -> list[CallRecord]:
    return [
        CallRecord.model_validate_json(r["record_json"])
        for r in rows(
            conn,
            "SELECT record_json FROM provider_calls WHERE job_id = :id ORDER BY seq",
            {"id": job_id},
        )
    ]


def _budget(job: RowMapping, records: Sequence[CallRecord]) -> ExecutionBudget | None:
    if job["deadline_at"] is None:
        return None
    usage = summarize_usage(records)
    return ExecutionBudget(
        logical_job_id=job["id"],
        attempt_id=job["attempt_id"],
        max_provider_calls=job["max_provider_calls"],
        consumed_calls=usage.calls,
        deadline_at=from_wire_time(job["deadline_at"]),
        max_total_tokens=job["max_total_tokens"],
        consumed_tokens=usage.tokens,
        max_cost=None if job["max_cost"] is None else Decimal(job["max_cost"]),
        consumed_cost=usage.cost,
        usage_complete=usage.tokens_complete and usage.cost_complete,
    )


def _optional_time(value: str | None) -> datetime | None:
    return None if value is None else from_wire_time(value)


def _error(value: str | None) -> APIError | None:
    return None if value is None else APIError.model_validate_json(value)


def _job_dto(conn: Connection, job: RowMapping) -> Job:
    attempts = [
        JobAttempt(
            attempt_id=a["attempt_id"],
            number=a["number"],
            started_at=from_wire_time(a["started_at"]),
            finished_at=_optional_time(a["finished_at"]),
            state=a["state"],
            error=_error(a["error_json"]),
        )
        for a in rows(
            conn,
            "SELECT * FROM job_attempts WHERE job_id = :id ORDER BY number",
            {"id": job["id"]},
        )
    ]
    records = call_records(conn, job["id"])
    return Job(
        id=job["id"],
        batch_id=job["batch_id"],
        conversation_id=job["conversation_id"],
        conversation_revision=job["conversation_revision"],
        state=job["state"],
        attempts=attempts,
        max_attempts=job["max_attempts"],
        next_attempt_at=_optional_time(job["next_attempt_at"]),
        attempt_id=job["attempt_id"],
        lease_id=job["lease_id"],
        lease_expires_at=_optional_time(job["lease_expires_at"]),
        budget=_budget(job, records),
        progress=JobProgress(
            stage=job["stage"],
            completed_calls=sum(1 for r in records if r.outcome != "started"),
        ),
        evaluation_id=job["evaluation_id"],
        error=_error(job["error_json"]),
    )


def _fingerprint(body: CreateBatch) -> str:
    """Identifies a batch request for idempotency; not a contract content hash."""
    normalized = {
        "conversation_ids": sorted(set(body.conversation_ids)),
        "checklist_version_id": body.checklist_version_id,
        "profile_id": body.profile_id,
        "mode": body.mode,
    }
    return hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()


def _batch_dto(conn: Connection, batch: RowMapping) -> EvaluationBatch:
    job_rows = rows(
        conn, "SELECT * FROM jobs WHERE batch_id = :id ORDER BY seq", {"id": batch["id"]}
    )
    jobs = [_job_dto(conn, j) for j in job_rows]
    states = Counter(job.state for job in jobs)
    return EvaluationBatch(
        id=batch["id"],
        checklist_version_id=batch["checklist_version_id"],
        profile_id=batch["profile_id"],
        profile_version=batch["profile_version"],
        corpus_snapshot_id=batch["corpus_snapshot_id"],
        mode=batch["mode"],
        created_at=from_wire_time(batch["created_at"]),
        progress=BatchProgress(
            total=len(jobs),
            queued=states["queued"],
            running=states["running"],
            retry_wait=states["retry_wait"],
            succeeded=states["succeeded"],
            failed=states["failed"],
            cancelled=states["cancelled"],
        ),
        jobs=jobs,
    )


def create_batch(services: Services, body: CreateBatch, key: str) -> EvaluationBatch:
    fingerprint = _fingerprint(body)
    now = to_wire_time(services.clock())
    with services.db.write() as conn:
        existing = row(
            conn, "SELECT * FROM batches WHERE idempotency_key = :key", {"key": key}
        )
        if existing is not None:
            if existing["request_fingerprint"] != fingerprint:
                raise ApiFailure(
                    make_error(
                        ErrorCode.IDEMPOTENCY_CONFLICT,
                        "Idempotency key was already used with a different request",
                    )
                )
            return _batch_dto(conn, existing)

        pinned_checklist(conn, body.checklist_version_id)
        profile = latest_profile(conn, body.profile_id)
        failure = profile_configuration_error(services, profile)
        if failure is not None:
            raise failure
        corpus = pinned_corpus(conn, profile.corpus_snapshot_id)

        targets: list[tuple[str, int]] = []
        missing: list[ErrorDetail] = []
        for index, conversation_id in enumerate(dict.fromkeys(body.conversation_ids)):
            found = row(
                conn,
                "SELECT latest_revision FROM conversations WHERE id = :id",
                {"id": conversation_id},
            )
            if found is None:
                missing.append(
                    ErrorDetail(index=index, field="conversation_ids", reason="invalid")
                )
            else:
                targets.append((conversation_id, int(found["latest_revision"])))
        if missing:
            raise ApiFailure(
                make_error(ErrorCode.NOT_FOUND, "Conversation not found", details=missing)
            )

        batch_id = f"batch_{uuid4().hex}"
        run(
            conn,
            "INSERT INTO batches (id, idempotency_key, request_fingerprint, checklist_version_id, "
            "profile_id, profile_version, corpus_snapshot_id, mode, created_at) VALUES (:id, :key, "
            ":fingerprint, :checklist, :profile, :version, :corpus, :mode, :now)",
            {
                "id": batch_id,
                "key": key,
                "fingerprint": fingerprint,
                "checklist": body.checklist_version_id,
                "profile": profile.id,
                "version": profile.version,
                "corpus": corpus.id,
                "mode": body.mode,
                "now": now,
            },
        )
        for conversation_id, revision in targets:
            run(
                conn,
                "INSERT INTO jobs (id, batch_id, conversation_id, conversation_revision, "
                "checklist_version_id, profile_id, profile_version, corpus_snapshot_id, mode, "
                "state, max_attempts, stage, created_at, updated_at) VALUES (:id, :batch, "
                ":conversation, :revision, :checklist, :profile, :version, :corpus, :mode, "
                "'queued', :max_attempts, 'queued', :now, :now)",
                {
                    "id": f"job_{uuid4().hex}",
                    "batch": batch_id,
                    "conversation": conversation_id,
                    "revision": revision,
                    "checklist": body.checklist_version_id,
                    "profile": profile.id,
                    "version": profile.version,
                    "corpus": corpus.id,
                    "mode": body.mode,
                    "max_attempts": profile.retries.max_job_attempts,
                    "now": now,
                },
            )
        created = row(conn, "SELECT * FROM batches WHERE id = :id", {"id": batch_id})
        assert created is not None
        return _batch_dto(conn, created)


def get_batch(services: Services, batch_id: str) -> EvaluationBatch:
    with services.db.read() as conn:
        found = row(conn, "SELECT * FROM batches WHERE id = :id", {"id": batch_id})
        if found is None:
            raise not_found("Evaluation batch")
        return _batch_dto(conn, found)


def get_job(services: Services, job_id: str) -> Job:
    with services.db.read() as conn:
        found = row(conn, "SELECT * FROM jobs WHERE id = :id", {"id": job_id})
        if found is None:
            raise not_found("Job")
        return _job_dto(conn, found)


def _lease_lost(job_id: str) -> LeaseLost:
    return LeaseLost(
        APIError(
            code=ErrorCode.LEASE_LOST,
            message="Attempt no longer holds the job lease",
            retryable=False,
            correlation_id=job_id,
        )
    )


def _budget_exceeded(job_id: str, message: str) -> BudgetExceeded:
    return BudgetExceeded(
        APIError(
            code=ErrorCode.BUDGET_EXCEEDED,
            message=message,
            retryable=False,
            correlation_id=job_id,
        )
    )


def _persistence_error(job_id: str, message: str) -> ObserverPersistenceError:
    return ObserverPersistenceError(
        APIError(
            code=ErrorCode.PERSISTENCE_ERROR,
            message=message,
            retryable=True,
            correlation_id=job_id,
        )
    )


def budget_exhaustion(
    job: RowMapping, records: Sequence[CallRecord], now: datetime
) -> str | None:
    """The reason no further provider call may start, or None while one still may."""
    if job["deadline_at"] is not None and now >= from_wire_time(job["deadline_at"]):
        return "Job deadline has passed"
    usage = summarize_usage(records)
    if job["max_provider_calls"] is not None and usage.calls >= job["max_provider_calls"]:
        return "Provider call limit is exhausted"
    if job["max_total_tokens"] is not None:
        if not usage.tokens_complete:
            return "Token cap cannot be enforced because usage is unknown"
        if (usage.tokens or 0) >= job["max_total_tokens"]:
            return "Token limit is exhausted"
    if job["max_cost"] is not None:
        if not usage.cost_complete:
            return "Cost cap cannot be enforced because cost is unknown"
        if (usage.cost or Decimal("0")) >= Decimal(job["max_cost"]):
            return "Cost limit is exhausted"
    return None


@dataclass(frozen=True)
class RetryTiming:
    base_seconds: float
    max_seconds: float

    def delay(self, attempt_number: int) -> timedelta:
        seconds = min(self.base_seconds * (2 ** max(attempt_number - 1, 0)), self.max_seconds)
        return timedelta(seconds=seconds)


class JobQueue:
    def __init__(
        self,
        db: Database,
        clock: Clock,
        *,
        lease_seconds: float,
        retry: RetryTiming,
    ) -> None:
        self._db = db
        self._clock = clock
        self._lease = timedelta(seconds=lease_seconds)
        self._retry = retry

    def _fail_without_attempt(self, conn: Connection, job: RowMapping, reason: str) -> None:
        error = make_error(ErrorCode.BUDGET_EXCEEDED, reason)
        run(
            conn,
            "UPDATE jobs SET state = 'failed', stage = 'done', next_attempt_at = NULL, "
            "error_json = :error, updated_at = :now WHERE id = :id",
            {
                "error": error.model_dump_json(),
                "now": to_wire_time(self._clock()),
                "id": job["id"],
            },
        )

    def claim_next(self) -> Claim | None:
        now = self._clock()
        wire_now = to_wire_time(now)
        with self._db.write() as conn:
            while True:
                job = row(
                    conn,
                    "SELECT * FROM jobs WHERE state = 'queued' OR "
                    "(state = 'retry_wait' AND next_attempt_at <= :now) ORDER BY seq LIMIT 1",
                    {"now": wire_now},
                )
                if job is None:
                    return None
                reason = budget_exhaustion(job, call_records(conn, job["id"]), now)
                if reason is None:
                    return self._start_attempt(conn, job, now)
                # An exhausted job is never retried automatically.
                self._fail_without_attempt(conn, job, reason)

    def _start_attempt(self, conn: Connection, job: RowMapping, now: datetime) -> Claim:
        count = row(
            conn, "SELECT COUNT(*) AS n FROM job_attempts WHERE job_id = :id", {"id": job["id"]}
        )
        number = int(count["n"]) + 1 if count else 1
        attempt_id, lease_id = f"att_{uuid4().hex}", f"lease_{uuid4().hex}"
        wire_now = to_wire_time(now)
        run(
            conn,
            "INSERT INTO job_attempts (attempt_id, job_id, number, lease_id, started_at, state) "
            "VALUES (:attempt, :job, :number, :lease, :now, 'running')",
            {
                "attempt": attempt_id,
                "job": job["id"],
                "number": number,
                "lease": lease_id,
                "now": wire_now,
            },
        )
        if job["deadline_at"] is None:
            # First run pins the shared limits. No later attempt ever resets them.
            profile = pinned_profile(conn, job["profile_id"], job["profile_version"])
            retries = profile.retries
            run(
                conn,
                "UPDATE jobs SET deadline_at = :deadline, max_provider_calls = :calls, "
                "max_total_tokens = :tokens, max_cost = :cost WHERE id = :id",
                {
                    "deadline": to_wire_time(now + timedelta(seconds=retries.job_deadline_seconds)),
                    "calls": retries.max_provider_calls,
                    "tokens": retries.max_total_tokens,
                    "cost": None if retries.max_cost is None else format(retries.max_cost, "f"),
                    "id": job["id"],
                },
            )
        run(
            conn,
            "UPDATE jobs SET state = 'running', attempt_id = :attempt, lease_id = :lease, "
            "lease_expires_at = :expires, next_attempt_at = NULL, stage = 'evaluating', "
            "error_json = NULL, updated_at = :now WHERE id = :id",
            {
                "attempt": attempt_id,
                "lease": lease_id,
                "expires": to_wire_time(now + self._lease),
                "now": wire_now,
                "id": job["id"],
            },
        )
        return Claim(job["id"], attempt_id, lease_id, number)

    def _current_job(self, conn: Connection, job_id: str) -> RowMapping:
        job = row(conn, "SELECT * FROM jobs WHERE id = :id", {"id": job_id})
        if job is None:
            raise _persistence_error(job_id, "Job record is missing")
        return job

    def _holds_lease(self, job: RowMapping, claim: Claim) -> bool:
        return (
            job["state"] == "running"
            and job["attempt_id"] == claim.attempt_id
            and job["lease_id"] == claim.lease_id
            and job["lease_expires_at"] is not None
            and self._clock() < from_wire_time(job["lease_expires_at"])
        )

    def load_inputs(self, claim: Claim) -> ExecutionInputs:
        with self._db.read() as conn:
            job = self._current_job(conn, claim.job_id)
            if not self._holds_lease(job, claim):
                raise _lease_lost(claim.job_id)
            budget = _budget(job, call_records(conn, claim.job_id))
            assert budget is not None
            return ExecutionInputs(
                conversation=pinned_conversation(
                    conn, job["conversation_id"], job["conversation_revision"]
                ),
                checklist=pinned_checklist(conn, job["checklist_version_id"]),
                profile=pinned_profile(conn, job["profile_id"], job["profile_version"]),
                corpus=pinned_corpus(conn, job["corpus_snapshot_id"]),
                budget=budget,
                mode=job["mode"],
                batch_id=job["batch_id"],
            )

    def record_call_started(self, claim: Claim, event: CallEvent) -> ExecutionBudget:
        now = self._clock()
        with self._db.write() as conn:
            job = self._current_job(conn, claim.job_id)
            if event.logical_job_id != claim.job_id or event.attempt_id != claim.attempt_id:
                raise _persistence_error(claim.job_id, "Call event identity does not match")
            if not self._holds_lease(job, claim):
                raise _lease_lost(claim.job_id)
            known = row(
                conn,
                "SELECT attempt_id FROM provider_calls WHERE call_id = :id",
                {"id": event.call_id},
            )
            if known is not None:
                if known["attempt_id"] != claim.attempt_id:
                    raise _persistence_error(claim.job_id, "Call ID belongs to another attempt")
            else:
                reason = budget_exhaustion(job, call_records(conn, claim.job_id), now)
                if reason is not None:
                    raise _budget_exceeded(claim.job_id, reason)
                run(
                    conn,
                    "INSERT INTO provider_calls (call_id, job_id, attempt_id, outcome, record_json)"
                    " VALUES (:call, :job, :attempt, :outcome, :record)",
                    {
                        "call": event.call_id,
                        "job": claim.job_id,
                        "attempt": claim.attempt_id,
                        "outcome": event.record.outcome,
                        "record": event.record.model_dump_json(),
                    },
                )
            budget = _budget(job, call_records(conn, claim.job_id))
            assert budget is not None
            return budget

    def record_call_finished(self, claim: Claim, event: CallEvent) -> ExecutionBudget:
        """Known spend is kept even for a stale attempt, which then learns it lost the lease."""
        with self._db.write() as conn:
            job = self._current_job(conn, claim.job_id)
            known = row(
                conn,
                "SELECT attempt_id, outcome FROM provider_calls WHERE call_id = :id",
                {"id": event.call_id},
            )
            if known is None or known["attempt_id"] != event.attempt_id:
                raise _persistence_error(claim.job_id, "Finished call was never started")
            if known["outcome"] == "started":
                run(
                    conn,
                    "UPDATE provider_calls SET outcome = :outcome, record_json = :record "
                    "WHERE call_id = :id",
                    {
                        "outcome": event.record.outcome,
                        "record": event.record.model_dump_json(),
                        "id": event.call_id,
                    },
                )
            stale = not self._holds_lease(job, claim)
            budget = _budget(job, call_records(conn, claim.job_id))
            assert budget is not None
        if stale:
            raise _lease_lost(claim.job_id)
        return budget

    def mark_stage(self, claim: Claim, stage: str) -> None:
        with self._db.write() as conn:
            run(
                conn,
                "UPDATE jobs SET stage = :stage WHERE id = :id AND attempt_id = :attempt",
                {"stage": stage, "id": claim.job_id, "attempt": claim.attempt_id},
            )

    def _insert_evaluation(
        self,
        conn: Connection,
        job: RowMapping,
        artifact: EvaluationArtifact,
        automatic_score: ScoreSummary,
        reuse: ReuseProvenance,
    ) -> str:
        evaluation_id = f"eval_{uuid4().hex}"
        run(
            conn,
            "INSERT INTO evaluations (id, job_id, batch_id, conversation_id, "
            "conversation_revision, checklist_version_id, profile_id, profile_version, "
            "corpus_snapshot_id, status, revision, artifact_json, automatic_score_json, "
            "effective_proposals_json, effective_score_json, reuse_mode, reused_from, reuse_key, "
            "created_at) VALUES (:id, :job, :batch, :conversation, :revision, :checklist, "
            ":profile, :version, :corpus, :status, 1, :artifact, :score, :proposals, :score, "
            ":reuse_mode, :reused_from, :reuse_key, :now)",
            {
                "id": evaluation_id,
                "job": job["id"],
                "batch": job["batch_id"],
                "conversation": job["conversation_id"],
                "revision": job["conversation_revision"],
                "checklist": job["checklist_version_id"],
                "profile": job["profile_id"],
                "version": job["profile_version"],
                "corpus": job["corpus_snapshot_id"],
                "status": artifact.status,
                "artifact": artifact.model_dump_json(),
                "score": automatic_score.model_dump_json(),
                "proposals": json.dumps(
                    [p.model_dump(mode="json") for p in artifact.automatic_final],
                    ensure_ascii=False,
                ),
                "reuse_mode": reuse.mode,
                "reused_from": reuse.reused_from_evaluation_id,
                "reuse_key": reuse.reuse_key,
                "now": to_wire_time(self._clock()),
            },
        )
        return evaluation_id

    def commit_success(
        self,
        claim: Claim,
        artifact: EvaluationArtifact,
        automatic_score: ScoreSummary,
        reuse: ReuseProvenance,
    ) -> str:
        """One transaction: result, score, binding and terminal state, or none of them."""
        with self._db.write() as conn:
            job = self._current_job(conn, claim.job_id)
            if not self._holds_lease(job, claim):
                raise _lease_lost(claim.job_id)
            evaluation_id = self._insert_evaluation(conn, job, artifact, automatic_score, reuse)
            self._mark_succeeded(conn, claim, evaluation_id)
            return evaluation_id

    def _mark_succeeded(self, conn: Connection, claim: Claim, evaluation_id: str) -> None:
        now = to_wire_time(self._clock())
        run(
            conn,
            "UPDATE job_attempts SET state = 'succeeded', finished_at = :now "
            "WHERE attempt_id = :attempt",
            {"now": now, "attempt": claim.attempt_id},
        )
        run(
            conn,
            "UPDATE jobs SET state = 'succeeded', stage = 'done', evaluation_id = :evaluation, "
            "lease_id = NULL, lease_expires_at = NULL, error_json = NULL, updated_at = :now "
            "WHERE id = :id",
            {"evaluation": evaluation_id, "now": now, "id": claim.job_id},
        )

    def commit_failure(
        self,
        claim: Claim,
        error: APIError,
        *,
        retryable: bool,
        final_artifact: EvaluationArtifact | None = None,
        final_score: ScoreSummary | None = None,
        reuse: ReuseProvenance | None = None,
    ) -> str:
        """Returns the resulting job state. A stale attempt changes nothing but itself."""
        now = self._clock()
        wire_now = to_wire_time(now)
        with self._db.write() as conn:
            job = self._current_job(conn, claim.job_id)
            error_json = error.model_dump_json()
            if not self._holds_lease(job, claim):
                run(
                    conn,
                    "UPDATE job_attempts SET state = 'expired', finished_at = :now, "
                    "error_json = :error WHERE attempt_id = :attempt AND state = 'running'",
                    {"now": wire_now, "error": error_json, "attempt": claim.attempt_id},
                )
                return str(job["state"])
            run(
                conn,
                "UPDATE job_attempts SET state = 'failed', finished_at = :now, "
                "error_json = :error WHERE attempt_id = :attempt",
                {"now": wire_now, "error": error_json, "attempt": claim.attempt_id},
            )
            reason = budget_exhaustion(job, call_records(conn, claim.job_id), now)
            next_attempt = now + self._retry.delay(claim.number)
            can_retry = (
                retryable
                and claim.number < int(job["max_attempts"])
                and reason is None
                and next_attempt < from_wire_time(job["deadline_at"])
            )
            evaluation_id = None
            if not can_retry and final_artifact is not None and final_score is not None:
                assert reuse is not None
                evaluation_id = self._insert_evaluation(
                    conn, job, final_artifact, final_score, reuse
                )
            run(
                conn,
                "UPDATE jobs SET state = :state, stage = 'done', next_attempt_at = :next, "
                "lease_id = NULL, lease_expires_at = NULL, error_json = :error, "
                "evaluation_id = :evaluation, updated_at = :now WHERE id = :id",
                {
                    "state": "retry_wait" if can_retry else "failed",
                    "next": to_wire_time(next_attempt) if can_retry else None,
                    "error": error_json,
                    "evaluation": evaluation_id,
                    "now": wire_now,
                    "id": claim.job_id,
                },
            )
            return "retry_wait" if can_retry else "failed"


def job_cost(records: Sequence[CallRecord]) -> tuple[Decimal | None, bool]:
    usage = summarize_usage(records)
    return usage.cost, usage.cost_complete


def build_queue(services: Services) -> JobQueue:
    return JobQueue(
        services.db,
        services.clock,
        lease_seconds=services.settings.lease_seconds,
        retry=RetryTiming(
            services.settings.retry_base_seconds, services.settings.retry_max_seconds
        ),
    )
