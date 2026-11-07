"""Baseline evaluator (one full-conversation call) with optional B-light extras:
pinned sources and a selective blind reviewer. Returns EvaluationArtifact only —
never a total score (scoring is cqa_domain.score, called by B).

Failure semantics:
- BudgetExceeded / EvaluationTimeout before a valid initial: raised (B does not
  auto-retry an exhausted logical job). After a valid initial they only skip review.
- LeaseLost, ObserverPersistenceError and cancellation always propagate.
- Provider failures / invalid output after bounded repair and allowed fallbacks:
  a failed artifact with a safe error; never fabricated undetermined/zero answers.
"""

from collections.abc import Callable, Mapping, Sequence
from typing import Literal

from cqa_contracts.interfaces import (
    BudgetExceeded,
    CallObserver,
    ConfigurationError,
    EvaluationTimeout,
)
from cqa_contracts.models import (
    APIError,
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    ErrorCode,
    EvaluationArtifact,
    EvaluationIdentity,
    EvaluatorProfile,
    ExecutionBudget,
    ProviderSelection,
    ReviewRecord,
    SourceFragment,
)
from cqa_domain import (
    checklist_semantic_hash,
    conversation_content_hash,
    corpus_snapshot_hash,
    profile_hash,
    validate_artifact,
    validate_checklist,
    validate_corpus,
)
from cqa_domain.errors import Problems

from .execution import CallRunner, Clock, Purpose
from .output import ParseResult, parse_proposals
from .pricing import PriceTable
from .prompts import (
    MAX_PROMPT_CHARS,
    SUPPORTED_PREPROCESSING_VERSIONS,
    SUPPORTED_PROMPT_VERSIONS,
    build_messages,
    build_repair_messages,
    prompt_size,
)
from .retrieval import RetrievalPolicy, RetrievedChunk, retrieve, sources_not_in_effect
from .reviewer import mark, select_for_review
from .transport import NO_FALLBACK, ChatMessage, ProviderFailure, ProviderTransport


def _config_error(message: str) -> ConfigurationError:
    return ConfigurationError(
        APIError(
            code=ErrorCode.CONFIGURATION_ERROR,
            message=message,
            retryable=False,
            correlation_id="evaluator-configuration",
        )
    )


class Evaluator:
    """Implements the shared Evaluator protocol over explicit transports."""

    def __init__(
        self,
        transports: Mapping[str, ProviderTransport],
        *,
        prices: PriceTable | None = None,
        retrieval: RetrievalPolicy | None = None,
        clock: Clock | None = None,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self.transports = dict(transports)
        self.prices = prices or PriceTable()
        self.retrieval = retrieval or RetrievalPolicy()
        self.clock = clock or Clock()
        self.id_factory = id_factory

    def _transport(self, selection: ProviderSelection) -> ProviderTransport:
        transport = self.transports.get(selection.provider)
        if transport is None:
            raise _config_error("No transport configured for the selected provider")
        return transport

    async def __call__(
        self,
        conversation: Conversation,
        checklist: ChecklistVersion,
        profile: EvaluatorProfile,
        corpus: CorpusSnapshot,
        budget: ExecutionBudget,
        call_observer: CallObserver,
    ) -> EvaluationArtifact:
        # --- preconditions (no calls yet) ---------------------------------
        if profile.prompt_version not in SUPPORTED_PROMPT_VERSIONS:
            raise _config_error("Unsupported prompt_version in evaluator profile")
        if profile.preprocessing_version not in SUPPORTED_PREPROCESSING_VERSIONS:
            raise _config_error("Unsupported preprocessing_version in evaluator profile")
        if profile.corpus_snapshot_id != corpus.id:
            raise _config_error("Profile is pinned to another corpus snapshot")
        selections = [profile.primary, *profile.fallbacks]
        if profile.reviewer_policy.enabled and profile.reviewer is not None:
            selections.append(profile.reviewer)
        for selection in selections:
            self._transport(selection)
        validate_checklist(checklist)
        validate_corpus(corpus)
        content_hash = conversation_content_hash(conversation)
        if conversation.content_hash != content_hash:
            problems = Problems()
            problems.add("conversation.content_hash", "invalid")
            problems.raise_if_any("Conversation content hash does not match its content")

        origin: Literal["ai", "test"] = "test" if profile.mode == "test" else "ai"
        identity = EvaluationIdentity(
            conversation_content_hash=content_hash,
            checklist_semantic_hash=checklist_semantic_hash(checklist),
            profile_hash=profile_hash(profile),
            corpus_snapshot_hash=corpus_snapshot_hash(corpus),
            audio_content_hash=None,  # no acoustic analysis is performed
        )
        retrieved = retrieve(conversation, corpus, self.retrieval)
        allowed = {r.chunk.chunk_id for r in retrieved}
        fragments = [SourceFragment(source=r.source, chunk=r.chunk) for r in retrieved]
        limitations: list[str] = []
        if profile.mode == "test":
            limitations.append("test_evaluator")
        if conversation.channel == "voice_call":
            limitations.append("audio_not_analyzed")
        if not retrieved:
            limitations.append("knowledge_sources_empty")
        if sources_not_in_effect(conversation, corpus):
            limitations.append("sources_not_in_effect_excluded")
        if any(r.date_status != "in_effect" for r in retrieved):
            limitations.append("source_date_applicability_unknown")

        runner = CallRunner(
            budget=budget,
            observer=call_observer,
            retries=profile.retries,
            generation=profile.generation,
            prices=self.prices,
            clock=self.clock,
            id_factory=self.id_factory,
        )
        requested = [c.id for c in checklist.criteria]
        messages = build_messages("primary", conversation, checklist, retrieved)

        def artifact(**fields: object) -> EvaluationArtifact:
            calls = runner.calls
            extra = ["cost_unknown"] if any(c.cost is None for c in calls) else []
            result = EvaluationArtifact.model_validate(
                {
                    "identity": identity,
                    "calls": calls,
                    "source_fragments": fragments,
                    "evaluator_mode": profile.mode,
                    "limitations": [*limitations, *extra],
                    **fields,
                }
            )
            validate_artifact(conversation, checklist, corpus, result)
            return result

        def failed(code: ErrorCode, message: str, retryable: bool) -> EvaluationArtifact:
            return artifact(
                status="failed",
                initial=[],
                reviews=[],
                automatic_final=[],
                error=APIError(
                    code=code,
                    message=message,
                    retryable=retryable,
                    correlation_id=budget.logical_job_id,
                ),
            )

        if prompt_size(messages) > MAX_PROMPT_CHARS:
            limitations.append("context_limit_exceeded")
            return failed(
                ErrorCode.VALIDATION_ERROR, "Conversation exceeds evaluator context limit", False
            )

        # --- initial: primary, bounded repair, pinned fallbacks -------------
        initial: list[CriterionProposal] | None = None
        last_failure: ProviderFailure | None = None
        attempts: list[tuple[ProviderSelection, Purpose]] = [(profile.primary, "primary")]
        attempts += [(f, "fallback") for f in profile.fallbacks]
        for n, (selection, purpose) in enumerate(attempts):
            if n > 0:
                reason = last_failure.kind if last_failure else "invalid_output"
                limitations.append(f"fallback_after_{reason}")
            try:
                result = await self._obtain(
                    runner,
                    selection,
                    purpose,
                    messages,
                    conversation,
                    checklist,
                    corpus,
                    requested,
                    allowed,
                    origin,
                    profile.retries.max_format_repairs,
                )
            except ProviderFailure as failure:
                last_failure = failure
                limitations.append(f"provider_{failure.kind}")
                if failure.kind in NO_FALLBACK:
                    break
                continue
            if result.ok:
                initial = result.proposals
                if n > 0:
                    limitations.append("fallback_used")
                break
            last_failure = None
            limitations.extend(sorted({f"invalid_output_{d}" for d in result.diagnostics}))

        if initial is None:
            if last_failure is not None:
                code = (
                    ErrorCode.CONFIGURATION_ERROR
                    if last_failure.kind in NO_FALLBACK
                    else ErrorCode.TIMEOUT
                    if last_failure.kind == "timeout"
                    else ErrorCode.PROVIDER_ERROR
                )
                return failed(code, last_failure.safe_message, last_failure.retryable)
            return failed(
                ErrorCode.PROVIDER_ERROR,
                "Model output remained invalid after bounded repair",
                False,
            )

        # --- optional blind reviewer ---------------------------------------
        reviews, final = await self._review(
            runner, profile, conversation, checklist, corpus, retrieved, allowed, initial, origin
        )
        if any(r.outcome in ("skipped", "failed") for r in reviews):
            limitations.append("review_unfinished")
        status = "partial" if any(p.applicability == "undetermined" for p in final) else "complete"
        return artifact(status=status, initial=initial, reviews=reviews, automatic_final=final)

    async def _obtain(
        self,
        runner: CallRunner,
        selection: ProviderSelection,
        purpose: Purpose,
        messages: tuple[ChatMessage, ...],
        conversation: Conversation,
        checklist: ChecklistVersion,
        corpus: CorpusSnapshot,
        requested: Sequence[str],
        allowed: set[str],
        origin: Literal["ai", "test"],
        max_repairs: int,
    ) -> ParseResult:
        transport = self._transport(selection)
        response = await runner.call(purpose, selection, transport, messages)
        result = self._parse(
            response.content,
            response.finish_reason,
            conversation,
            checklist,
            corpus,
            requested,
            allowed,
            origin,
        )
        repairs = 0
        while not result.ok and repairs < max_repairs:
            repairs += 1
            repair = build_repair_messages(messages, response.content, result.problems)
            response = await runner.call("repair", selection, transport, repair)
            result = self._parse(
                response.content,
                response.finish_reason,
                conversation,
                checklist,
                corpus,
                requested,
                allowed,
                origin,
            )
        return result

    @staticmethod
    def _parse(
        content: str,
        finish_reason: str,
        conversation: Conversation,
        checklist: ChecklistVersion,
        corpus: CorpusSnapshot,
        requested: Sequence[str],
        allowed: set[str],
        origin: Literal["ai", "test"],
    ) -> ParseResult:
        return parse_proposals(
            content,
            finish_reason=finish_reason,
            conversation=conversation,
            checklist=checklist,
            corpus=corpus,
            requested_ids=requested,
            allowed_chunk_ids=allowed,
            origin=origin,
        )

    async def _review(
        self,
        runner: CallRunner,
        profile: EvaluatorProfile,
        conversation: Conversation,
        checklist: ChecklistVersion,
        corpus: CorpusSnapshot,
        retrieved: Sequence[RetrievedChunk],
        allowed: set[str],
        initial: list[CriterionProposal],
        origin: Literal["ai", "test"],
    ) -> tuple[list[ReviewRecord], list[CriterionProposal]]:
        policy = profile.reviewer_policy
        if not policy.enabled or profile.reviewer is None or policy.max_criteria == 0:
            return [], list(initial)
        selected = select_for_review(checklist, initial, policy.max_criteria)
        if not selected:
            return [], list(initial)

        def records(
            outcome: Literal["skipped", "failed"], limitation: str, call_ids: list[str]
        ) -> list[ReviewRecord]:
            return [
                ReviewRecord(
                    criterion_id=cid,
                    proposal=None,
                    call_ids=call_ids,
                    outcome=outcome,
                    limitations=[limitation],
                )
                for cid in selected
            ]

        reviewer = profile.reviewer
        try:
            runner.check_can_call(reviewer)
        except (BudgetExceeded, EvaluationTimeout):
            return records("skipped", "review_budget_exhausted", []), list(initial)

        # Blind: built without any initial proposal content.
        messages = build_messages("review", conversation, checklist, retrieved, set(selected))
        before = len(runner.calls)
        try:
            response = await runner.call("review", reviewer, self._transport(reviewer), messages)
        except (BudgetExceeded, EvaluationTimeout):
            ids = [c.call_id for c in runner.calls[before:]]
            return records("skipped", "review_budget_exhausted", ids), list(initial)
        except ProviderFailure as failure:
            ids = [c.call_id for c in runner.calls[before:]]
            return records("failed", f"review_provider_{failure.kind}", ids), list(initial)
        ids = [c.call_id for c in runner.calls[before:]]
        # No format repair for the reviewer: it must not become a hidden repair loop.
        result = self._parse(
            response.content,
            response.finish_reason,
            conversation,
            checklist,
            corpus,
            selected,
            allowed,
            origin,
        )
        if not result.ok or result.proposals is None:
            return records("failed", "review_output_invalid", ids), list(initial)

        by_id = {p.criterion_id: p for p in result.proposals}
        reviews: list[ReviewRecord] = []
        final: list[CriterionProposal] = []
        for p in initial:
            second = by_id.get(p.criterion_id)
            if second is None:
                final.append(p)
                continue
            agreed = (p.applicability, p.answer_choice_id) == (
                second.applicability,
                second.answer_choice_id,
            )
            reviews.append(
                ReviewRecord(
                    criterion_id=p.criterion_id,
                    proposal=second,
                    call_ids=ids,
                    outcome="agreed" if agreed else "conflicted",
                )
            )
            final.append(mark(p, "reviewer_agreed" if agreed else "reviewer_disagreed"))
        return reviews, final
