"""Hash input shapes, derived from canonical fields; no hash implementation.

A implements projection, canonicalization and SHA-256 in cqa_domain. Contract
vectors specify JSON bytes. Object keys sort; arrays follow the rules documented
in docs/CONTRACTS.md. Dynamic models reuse field definitions rather than creating
an independently maintained second definition of domain fields.
"""

from types import GenericAlias
from typing import Any

from pydantic import create_model

from .models import (
    DTO,
    Choice,
    Conversation,
    CorpusSnapshot,
    Criterion,
    Message,
    RoundingPolicy,
    Section,
)


def _subset(name: str, source: type[DTO], fields: list[str], **overrides: Any) -> type[DTO]:
    selected: dict[str, Any] = {
        key: (source.model_fields[key].annotation, source.model_fields[key]) for key in fields
    }
    selected.update(overrides)
    return create_model(name, __base__=DTO, __module__=__name__, **selected)


ContentMessage = _subset("ContentMessage", Message, ["speaker", "text", "timestamp_original"])
ConversationHashInput = _subset(
    "ConversationHashInput",
    Conversation,
    ["channel", "language", "occurred_at"],
    messages=(GenericAlias(list, ContentMessage), ...),
)
SemanticChoice = _subset("SemanticChoice", Choice, ["id", "label", "raw_value", "anchor"])
SemanticCriterion = _subset(
    "SemanticCriterion",
    Criterion,
    [
        "id",
        "title",
        "definition",
        "response_type",
        "allow_na",
        "na_condition",
        "channel_instructions",
        "evidence_policy",
        "requires_reference",
        "flag_when_choice_ids",
    ],
    choices=(GenericAlias(list, SemanticChoice), ...),
)
SemanticHashInput = _subset(
    "SemanticHashInput", DTO, [], criteria=(GenericAlias(list, SemanticCriterion), ...)
)
ScoringChoice = _subset("ScoringChoice", Choice, ["id", "score_fraction"])
ScoringCriterion = _subset(
    "ScoringCriterion",
    Criterion,
    ["id", "weight", "section_id"],
    choices=(GenericAlias(list, ScoringChoice), ...),
)
ScoringHashInput = _subset(
    "ScoringHashInput",
    DTO,
    [],
    criteria=(GenericAlias(list, ScoringCriterion), ...),
    sections=(list[Section], ...),
    rounding=(RoundingPolicy, ...),
)

CorpusHashInput = _subset(
    "CorpusHashInput",
    CorpusSnapshot,
    ["id", "sources", "chunks", "applicability_policy", "priority_policy"],
)
