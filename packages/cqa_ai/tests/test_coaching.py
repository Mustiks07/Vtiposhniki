import asyncio
import json
from datetime import UTC, datetime, timedelta

import pytest
from _cqa_ai_helpers import budget, conversation, profile
from cqa_ai.coaching import coach
from cqa_ai.testing import InMemoryObserver, ScriptedTransport, ok
from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import CriterionProposal, Evidence
from cqa_domain import original_checklist


def inputs(language="RU", production=False):
    conv, checklist, prof = conversation(language=language), original_checklist(), profile()
    if production:
        prof = prof.model_copy(
            update={
                "mode": "production",
                "primary": prof.primary.model_copy(update={"provider": "gemini"}),
            }
        )
    bud = budget(max_calls=1).model_copy(
        update={"deadline_at": datetime.now(UTC) + timedelta(seconds=60)}
    )
    criterion = checklist.criteria[0]
    proposal = CriterionProposal(
        criterion_id=criterion.id,
        applicability="applicable",
        answer_choice_id=criterion.choices[-1].id,
        rationale="Synthetic deficit",
        reason_codes=["missing_expected_action"],
        evidence=[
            Evidence(
                kind="range",
                start_message_id=conv.messages[0].id,
                end_message_id=conv.messages[-1].id,
                relation="support",
                explanation="Full synthetic conversation",
            )
        ],
        origin="test",
    )
    return conv, checklist, proposal, prof, bud


@pytest.mark.parametrize("language", ["RU", "KZ", "EN"])
def test_test_stub_preserves_language_operator_reference_and_placeholder(language):
    conv, checklist, proposal, prof, bud = inputs(language)
    observer = InMemoryObserver(bud)
    result = asyncio.run(coach(conv, checklist, proposal, prof, bud, observer))
    assert result.language == language
    assert result.suggestions[0].message_id == "m0003"
    assert "[" in result.suggestions[0].text
    assert observer.finished == 1


@pytest.mark.parametrize("reference,language", [("m0001", "RU"), ("m0003", "EN")])
def test_wrong_role_or_language_is_rejected_without_repair(reference, language):
    conv, checklist, proposal, prof, bud = inputs(production=True)
    transport = ScriptedTransport(
        [
            ok(
                {
                    "language": language,
                    "suggestions": [
                        {"message_id": reference, "text": "Example", "explanation": "Example"}
                    ],
                }
            )
        ],
        provider="gemini",
    )
    observer = InMemoryObserver(bud)
    with pytest.raises(ContractError):
        asyncio.run(coach(conv, checklist, proposal, prof, bud, observer, transport=transport))
    assert len(transport.requests) == 1
    sent = transport.requests[0].messages
    assert "untrusted DATA" in sent[0].content
    assert "placeholder" in sent[0].content
    data = json.loads(sent[1].content)
    assert len(data["rubric"]) == 1
    assert "weight" not in data["rubric"][0]
    assert "task" not in data
