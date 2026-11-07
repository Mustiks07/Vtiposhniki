"""Hash projections over the shared input shapes in cqa_contracts.hash_inputs.

Each projection is built by validating the shared hash-input model, so the
input shapes stay owned by the contracts package while this module owns the
single runtime projection/canonicalization/SHA-256 implementation.
"""

from cqa_contracts import hash_inputs as hi
from cqa_contracts.models import (
    DTO,
    ChecklistDraft,
    Conversation,
    CorpusSnapshot,
    EvaluationIdentity,
    EvaluatorProfile,
)

from .canonical import canonical_hash, sha256_hex


def content_projection(conversation: Conversation) -> DTO:
    """Channel, language, occurred_at and ordered speaker/text/original time."""
    return hi.ConversationHashInput.model_validate(
        {
            "channel": conversation.channel,
            "language": conversation.language,
            "occurred_at": conversation.occurred_at,
            "messages": [
                hi.ContentMessage.model_validate(
                    {
                        "speaker": m.speaker,
                        "text": m.text,
                        "timestamp_original": m.timestamp_original,
                    }
                )
                for m in conversation.messages
            ],
        }
    )


def semantic_projection(checklist: ChecklistDraft) -> DTO:
    """Meaning of the rubric; excludes weights, fractions, sections and order."""
    criteria = []
    for c in sorted(checklist.criteria, key=lambda item: item.id):
        criteria.append(
            hi.SemanticCriterion.model_validate(
                {
                    "id": c.id,
                    "title": c.title,
                    "definition": c.definition,
                    "response_type": c.response_type,
                    "allow_na": c.allow_na,
                    "na_condition": c.na_condition,
                    "channel_instructions": c.channel_instructions,
                    "evidence_policy": c.evidence_policy,
                    "requires_reference": c.requires_reference,
                    "flag_when_choice_ids": sorted(c.flag_when_choice_ids),
                    "choices": [
                        hi.SemanticChoice.model_validate(
                            {
                                "id": ch.id,
                                "label": ch.label,
                                "raw_value": ch.raw_value,
                                "anchor": ch.anchor,
                            }
                        )
                        for ch in sorted(c.choices, key=lambda item: item.id)
                    ],
                }
            )
        )
    return hi.SemanticHashInput.model_validate({"criteria": criteria})


def scoring_projection(checklist: ChecklistDraft) -> DTO:
    """Weights, fractions, section assignment/titles and rounding; no display order."""
    return hi.ScoringHashInput.model_validate(
        {
            "criteria": [
                hi.ScoringCriterion.model_validate(
                    {
                        "id": c.id,
                        "weight": c.weight,
                        "section_id": c.section_id,
                        "choices": [
                            hi.ScoringChoice.model_validate(
                                {"id": ch.id, "score_fraction": ch.score_fraction}
                            )
                            for ch in sorted(c.choices, key=lambda item: item.id)
                        ],
                    }
                )
                for c in sorted(checklist.criteria, key=lambda item: item.id)
            ],
            "sections": sorted(checklist.sections, key=lambda s: s.id),
            "rounding": checklist.rounding,
        }
    )


def corpus_projection(corpus: CorpusSnapshot) -> DTO:
    """Pinned corpus without its own content_hash; stable source/chunk order."""
    return hi.CorpusHashInput.model_validate(
        {
            "id": corpus.id,
            "sources": sorted(corpus.sources, key=lambda s: (s.source_id, s.version)),
            "chunks": sorted(corpus.chunks, key=lambda c: c.chunk_id),
            "applicability_policy": corpus.applicability_policy,
            "priority_policy": corpus.priority_policy,
        }
    )


def conversation_content_hash(conversation: Conversation) -> str:
    return canonical_hash(content_projection(conversation))


def checklist_semantic_hash(checklist: ChecklistDraft) -> str:
    return canonical_hash(semantic_projection(checklist))


def checklist_scoring_hash(checklist: ChecklistDraft) -> str:
    return canonical_hash(scoring_projection(checklist))


def profile_hash(profile: EvaluatorProfile) -> str:
    return canonical_hash(profile)


def corpus_snapshot_hash(corpus: CorpusSnapshot) -> str:
    return canonical_hash(corpus_projection(corpus))


def evaluation_reuse_key(identity: EvaluationIdentity) -> str:
    return canonical_hash(identity)


def text_hash(text: str) -> str:
    """SHA-256 of exact UTF-8 text (source chunk/version content hashes)."""
    return sha256_hex(text)
