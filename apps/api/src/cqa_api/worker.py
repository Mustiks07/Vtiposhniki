"""The managed executor: claims durable jobs and calls the evaluator outside any transaction."""

import asyncio
import logging
import signal
from collections.abc import Callable
from typing import TypeVar

from cqa_contracts.interfaces import (
    BudgetExceeded,
    ConfigurationError,
    ContractError,
    DomainValidationError,
    LeaseLost,
    ObserverPersistenceError,
)
from cqa_contracts.models import (
    APIError,
    CallEvent,
    ErrorCode,
    EvaluationArtifact,
    EvaluationIdentity,
    ExecutionBudget,
    ReuseProvenance,
)
from sqlalchemy.exc import SQLAlchemyError

from .errors import make_error
from .evaluations import no_score
from .jobs import Claim, ExecutionInputs, JobQueue, build_queue
from .registry import sync_registry
from .services import Services, build_services
from .settings import load_settings

logger = logging.getLogger("cqa_api.worker")
T = TypeVar("T")


class AttemptObserver:
    """Bound to one attempt: an event from anywhere else cannot move this budget."""

    def __init__(self, queue: JobQueue, claim: Claim) -> None:
        self._queue = queue
        self._claim = claim

    async def __call__(self, event: CallEvent) -> ExecutionBudget:
        record = (
            self._queue.record_call_started
            if event.event == "call_started"
            else self._queue.record_call_finished
        )
        try:
            return await asyncio.to_thread(record, self._claim, event)
        except SQLAlchemyError as exc:
            # A started failure forbids the request; a finished failure forbids success.
            raise ObserverPersistenceError(
                APIError(
                    code=ErrorCode.PERSISTENCE_ERROR,
                    message="Call event could not be stored",
                    retryable=True,
                    correlation_id=self._claim.attempt_id,
                )
            ) from exc


class Worker:
    def __init__(self, services: Services) -> None:
        self._services = services
        self._queue = build_queue(services)

    @property
    def queue(self) -> JobQueue:
        return self._queue

    async def _db(self, call: Callable[..., T], *args: object, **kwargs: object) -> T:
        return await asyncio.to_thread(call, *args, **kwargs)

    def _identity(
        self, inputs: ExecutionInputs, artifact: EvaluationArtifact | None
    ) -> EvaluationIdentity:
        """Built from pinned hashes. The artifact only contributes the audio it declares."""
        domain = self._services.domain
        return EvaluationIdentity(
            conversation_content_hash=inputs.conversation.content_hash,
            checklist_semantic_hash=inputs.checklist.semantic_hash,
            profile_hash=domain.profile_hash(inputs.profile),
            corpus_snapshot_hash=inputs.corpus.content_hash,
            audio_content_hash=None if artifact is None else artifact.identity.audio_content_hash,
        )

    def _provenance(
        self, inputs: ExecutionInputs, artifact: EvaluationArtifact | None
    ) -> ReuseProvenance:
        key = self._services.domain.evaluation_reuse_key(self._identity(inputs, artifact))
        return ReuseProvenance(
            mode=inputs.mode,  # type: ignore[arg-type]  # CHECK constraint guards the column
            reused_from_evaluation_id=None,
            reuse_key=key,
        )

    async def _accept(
        self, claim: Claim, inputs: ExecutionInputs, artifact: EvaluationArtifact
    ) -> None:
        domain = self._services.domain
        provenance = self._provenance(inputs, artifact)
        if artifact.status == "failed":
            assert artifact.error is not None
            await self._db(
                self._queue.commit_failure,
                claim,
                artifact.error,
                retryable=artifact.error.retryable,
                final_artifact=artifact,
                final_score=no_score(),
                reuse=provenance,
            )
            return
        domain.validate_artifact(inputs.conversation, inputs.checklist, inputs.corpus, artifact)
        score = domain.score(inputs.checklist, artifact.automatic_final)
        await self._db(self._queue.mark_stage, claim, "persisting")
        await self._db(self._queue.commit_success, claim, artifact, score, provenance)

    async def _evaluate(self, claim: Claim, inputs: ExecutionInputs) -> EvaluationArtifact:
        remaining = (inputs.budget.deadline_at - self._services.clock()).total_seconds()
        return await asyncio.wait_for(
            self._services.evaluator(
                inputs.conversation,
                inputs.checklist,
                inputs.profile,
                inputs.corpus,
                inputs.budget,
                AttemptObserver(self._queue, claim),
            ),
            timeout=max(remaining, 0),
        )

    async def execute(self, claim: Claim) -> None:
        try:
            inputs = await self._db(self._queue.load_inputs, claim)
            artifact = await self._evaluate(claim, inputs)
            await self._accept(claim, inputs, artifact)
        except LeaseLost:
            # A newer attempt may own the job; this one must not touch its state.
            logger.info("Attempt %s lost its lease", claim.attempt_id)
            await self._fail(claim, make_error(ErrorCode.LEASE_LOST, "Lease lost"), False)
        except BudgetExceeded as exc:
            await self._fail(claim, exc.error, False)
        except (ConfigurationError, DomainValidationError) as exc:
            await self._fail(claim, exc.error, False)
        except TimeoutError:
            error = make_error(ErrorCode.TIMEOUT, "Job deadline was reached")
            await self._fail(claim, error, False)
        except ContractError as exc:
            await self._fail(claim, exc.error, exc.error.retryable)
        except NotImplementedError:
            error = make_error(
                ErrorCode.CONFIGURATION_ERROR, "A required domain or AI module is not available"
            )
            await self._fail(claim, error, False)
        except Exception as exc:
            # Type only: the message could carry provider text or private data.
            logger.error("Attempt %s failed with %s", claim.attempt_id, type(exc).__name__)
            error = make_error(ErrorCode.INTERNAL_ERROR, "Evaluation attempt failed")
            await self._fail(claim, error, True)

    async def _fail(self, claim: Claim, error: APIError, retryable: bool) -> None:
        await self._db(self._queue.commit_failure, claim, error, retryable=retryable)

    async def drain(self) -> int:
        """Run claimable jobs to exhaustion in this task. Returns the number of attempts."""
        attempts = 0
        while (claim := await self._db(self._queue.claim_next)) is not None:
            attempts += 1
            await self.execute(claim)
        return attempts

    async def run(self, stop: asyncio.Event) -> None:
        """Bounded concurrency over a single loop; provider waits share it, not DB locks."""
        running: set[asyncio.Task[None]] = set()
        limit = max(self._services.settings.worker_concurrency, 1)
        poll = self._services.settings.worker_poll_seconds
        try:
            while not stop.is_set():
                claimed = False
                if len(running) < limit:
                    try:
                        claim = await self._db(self._queue.claim_next)
                    except SQLAlchemyError:
                        logger.error("Could not poll for work; will retry")
                        claim = None
                    if claim is not None:
                        claimed = True
                        task = asyncio.create_task(self.execute(claim))
                        running.add(task)
                        task.add_done_callback(running.discard)
                if not claimed:
                    await _wait(stop, poll)
        finally:
            for task in list(running):
                task.cancel()
            if running:
                await asyncio.gather(*running, return_exceptions=True)


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except TimeoutError:
        pass


async def _standalone(services: Services) -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for name in ("SIGINT", "SIGTERM"):
        sig = getattr(signal, name, None)
        if sig is not None:
            try:
                loop.add_signal_handler(sig, stop.set)
            except NotImplementedError:  # Windows event loops
                signal.signal(sig, lambda *_: loop.call_soon_threadsafe(stop.set))
    await Worker(services).run(stop)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)  # its INFO line prints full URLs
    services = build_services(load_settings())
    services.db.migrate()
    sync_registry(services)
    try:
        asyncio.run(_standalone(services))
    finally:
        services.db.dispose()


if __name__ == "__main__":
    main()
