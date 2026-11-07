"""Explicit test mode only: never reachable when CQA_MODE=production.

While cqa_domain is unimplemented, test mode keeps the vertical path runnable:

* real cqa_domain functions always win once they stop raising NotImplementedError;
* the score stand-in does NO arithmetic: it returns total_score=null;
* the hash stand-ins are deliberately NOT the canonical algorithm. A domain-separated
  prefix guarantees they cannot be mistaken for, or collide with, a contract hash.

Delete nothing here when A lands: the stand-ins simply stop being called.
"""

import hashlib
import logging
from collections.abc import Callable
from decimal import Decimal

from cqa_contracts.models import (
    ChecklistVersion,
    Conversation,
    CorpusSnapshot,
    CriterionProposal,
    EvaluationArtifact,
    EvaluationIdentity,
    EvaluatorProfile,
    GenerationSettings,
    ProviderSelection,
    RetryPolicy,
    ReviewerPolicy,
    ScoreContribution,
    ScoreSummary,
)
from cqa_contracts.testing import SyntheticEvaluator
from pydantic import BaseModel

from .ports import DomainPort, production_domain
from .settings import Settings

logger = logging.getLogger("cqa_api.testmode")

TEST_PROFILE_ID = "test-synthetic"
TEST_CORPUS_ID = "test-empty-corpus"
ZERO_HASH = "0" * 64


def _digest(kind: str, payload: BaseModel | str) -> str:
    body = payload if isinstance(payload, str) else payload.model_dump_json()
    return hashlib.sha256(f"cqa-test-standin-v1\0{kind}\0{body}".encode()).hexdigest()


def _conversation_hash(conversation: Conversation) -> str:
    fields = conversation.model_dump_json(include={"channel", "language", "occurred_at"})
    messages = [
        (m.speaker, m.text, m.timestamp_original) for m in conversation.messages
    ]
    return _digest("content", f"{fields}{messages!r}")


def _semantic_hash(checklist: ChecklistVersion) -> str:
    # Same exclusions as the contract projection: no weight, fraction, section or order.
    criteria = [
        (
            c.id,
            c.title,
            c.definition,
            c.response_type,
            c.allow_na,
            c.na_condition,
            c.channel_instructions.model_dump_json(),
            c.evidence_policy.model_dump_json(),
            c.requires_reference,
            sorted(c.flag_when_choice_ids),
            [(x.id, x.label, x.raw_value, x.anchor) for x in sorted(c.choices, key=lambda x: x.id)],
        )
        for c in sorted(checklist.criteria, key=lambda c: c.id)
    ]
    return _digest("semantic", repr(criteria))


def _scoring_hash(checklist: ChecklistVersion) -> str:
    return _digest(
        "scoring",
        checklist.model_dump_json(include={"criteria", "sections", "rounding"}),
    )


def _profile_hash(profile: EvaluatorProfile) -> str:
    return _digest("profile", profile)


def _corpus_hash(corpus: CorpusSnapshot) -> str:
    return _digest("corpus", corpus.model_dump_json(exclude={"content_hash"}))


def _reuse_key(identity: EvaluationIdentity) -> str:
    return _digest("reuse", identity)


def _score_without_arithmetic(
    checklist: ChecklistVersion, proposals: list[CriterionProposal]
) -> ScoreSummary:
    by_id = {p.criterion_id: p for p in proposals}
    contributions = []
    for criterion in checklist.criteria:
        proposal = by_id.get(criterion.id)
        contributions.append(
            ScoreContribution(
                criterion_id=criterion.id,
                applicability=proposal.applicability if proposal else "undetermined",
                answer_choice_id=proposal.answer_choice_id if proposal else None,
                raw_value=None,
                score_fraction=None,
                original_weight=criterion.weight,
                earned_weight=None,
                applicable_weight=Decimal("0"),
                normalized_contribution=None,
            )
        )
    return ScoreSummary(
        status="incomplete_evaluation",
        total_score=None,
        contributions=contributions,
        section_results=[],
        flags=[],
    )


def _accept_checklist(config: ChecklistVersion) -> None:
    return None


def _accept_artifact(
    conversation: Conversation,
    checklist: ChecklistVersion,
    corpus: CorpusSnapshot,
    artifact: EvaluationArtifact,
) -> None:
    return None


def _prefer_real[**P, R](
    name: str, real: Callable[P, R], stand_in: Callable[P, R]
) -> Callable[P, R]:
    warned: list[bool] = []

    def call(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return real(*args, **kwargs)
        except NotImplementedError:
            if not warned:
                warned.append(True)
                logger.warning("TEST MODE: cqa_domain.%s missing; using stand-in", name)
            return stand_in(*args, **kwargs)

    return call


def build_test_domain(base: DomainPort | None = None) -> DomainPort:
    real = base if base is not None else production_domain()
    return DomainPort(
        validate_checklist=_prefer_real(
            "validate_checklist", real.validate_checklist, _accept_checklist
        ),
        validate_artifact=_prefer_real(
            "validate_artifact", real.validate_artifact, _accept_artifact
        ),
        score=_prefer_real("score", real.score, _score_without_arithmetic),
        conversation_content_hash=_prefer_real(
            "conversation_content_hash", real.conversation_content_hash, _conversation_hash
        ),
        checklist_semantic_hash=_prefer_real(
            "checklist_semantic_hash", real.checklist_semantic_hash, _semantic_hash
        ),
        checklist_scoring_hash=_prefer_real(
            "checklist_scoring_hash", real.checklist_scoring_hash, _scoring_hash
        ),
        profile_hash=_prefer_real("profile_hash", real.profile_hash, _profile_hash),
        corpus_snapshot_hash=_prefer_real(
            "corpus_snapshot_hash", real.corpus_snapshot_hash, _corpus_hash
        ),
        evaluation_reuse_key=_prefer_real(
            "evaluation_reuse_key", real.evaluation_reuse_key, _reuse_key
        ),
        original_checklist_draft=real.original_checklist_draft,
    )


def build_test_evaluator(settings: Settings) -> SyntheticEvaluator:
    return SyntheticEvaluator(app_mode=settings.mode, scenario=settings.test_scenario)


def synthetic_profile() -> EvaluatorProfile:
    selection = ProviderSelection(
        provider="test", model="synthetic-contract-v1", configuration_ref="synthetic-only"
    )
    return EvaluatorProfile(
        id=TEST_PROFILE_ID,
        version="v1",
        mode="test",
        primary=selection,
        generation=GenerationSettings(),
        prompt_version="synthetic-v1",
        preprocessing_version="identity-v1",
        reviewer_policy=ReviewerPolicy(),
        # The synthetic evaluator never reports usage, so a token cap would fail closed.
        retries=RetryPolicy(max_total_tokens=None),
        corpus_snapshot_id=TEST_CORPUS_ID,
    )


def synthetic_corpus(domain: DomainPort) -> CorpusSnapshot:
    empty = CorpusSnapshot(
        id=TEST_CORPUS_ID,
        content_hash=ZERO_HASH,
        sources=[],
        chunks=[],
        applicability_policy="Synthetic test corpus: no sources apply.",
        priority_policy="Synthetic test corpus: no priorities.",
    )
    return empty.model_copy(update={"content_hash": domain.corpus_snapshot_hash(empty)})
