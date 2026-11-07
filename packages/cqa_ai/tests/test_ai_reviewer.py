import json
from typing import Any

from _cqa_ai_helpers import budget, conversation, corpus, make, profile, run
from cqa_ai.reviewer import select_for_review
from cqa_ai.testing import InMemoryObserver, answer_all, ok
from cqa_ai.transport import ProviderFailure
from cqa_domain import original_checklist, validate_artifact

CHECKLIST = original_checklist()
CONV = conversation()
SECRET = "INITIAL-RATIONALE-SENTINEL"


def initial(**kwargs: Any) -> dict[str, Any]:
    data = answer_all(CHECKLIST, CONV, **kwargs)
    for item in data["criteria"]:
        item["rationale"] = SECRET
    return data


def review(ids: list[str], choices: dict[str, str]) -> dict[str, Any]:
    full = answer_all(CHECKLIST, CONV, choices)
    return {"criteria": [c for c in full["criteria"] if c["criterion_id"] in ids]}


FLAGS = {
    "c3_identification": ["identification_order"],
    "c8_gross_errors": ["potential_violation"],
    "c7_closing": ["ambiguous_ending_or_role"],
}


async def test_reviewer_is_blind_and_limited_to_selected_criteria() -> None:
    evaluator, transport, _ = make(
        [ok(initial(flags=FLAGS)), ok(review(["c8_gross_errors", "c3_identification"], {}))]
    )
    artifact, _ = await run(evaluator, prof=profile(reviewer=True, max_criteria=2))
    assert [c.purpose for c in artifact.calls] == ["primary", "review"]
    request = transport.requests[1]
    assert request.model == "scripted-reviewer"
    text = "\n".join(m.content for m in request.messages)
    assert SECRET not in text  # no initial rationale
    payload = json.loads(request.messages[1].content)
    # potential_violation outranks identification_order; c7 is cut by max_criteria=2.
    assert [c["id"] for c in payload["rubric"]] == ["c3_identification", "c8_gross_errors"]
    assert "answer_choice_id" not in request.messages[1].content.split('"rubric"')[1]
    assert {r.criterion_id: r.outcome for r in artifact.reviews} == {
        "c3_identification": "agreed",
        "c8_gross_errors": "agreed",
    }
    validate_artifact(CONV, CHECKLIST, corpus(), artifact)


async def test_conflict_keeps_initial_and_marks_it() -> None:
    evaluator, _, _ = make(
        [
            ok(initial(flags={"c8_gross_errors": ["potential_violation"]})),
            ok(review(["c8_gross_errors"], {"c8_gross_errors": "no"})),
        ]
    )
    artifact, _ = await run(evaluator, prof=profile(reviewer=True))
    final = {p.criterion_id: p for p in artifact.automatic_final}
    assert final["c8_gross_errors"].answer_choice_id == "yes"  # initial kept
    assert "reviewer_disagreed" in final["c8_gross_errors"].review_reasons
    assert artifact.reviews[0].outcome == "conflicted"
    assert artifact.reviews[0].proposal is not None
    assert artifact.reviews[0].proposal.answer_choice_id == "no"
    validate_artifact(CONV, CHECKLIST, corpus(), artifact)


async def test_reviewer_failure_keeps_valid_initial_with_limitation() -> None:
    evaluator, _, _ = make(
        [
            ok(initial(flags=FLAGS, undetermined=("c4_consultation",))),
            ProviderFailure("refusal", "Model refused to answer"),
        ]
    )
    artifact, _ = await run(evaluator, prof=profile(reviewer=True))
    assert artifact.status == "partial"  # meaningful partial survives
    assert {r.outcome for r in artifact.reviews} == {"failed"}
    assert "review_unfinished" in artifact.limitations
    validate_artifact(CONV, CHECKLIST, corpus(), artifact)


async def test_invalid_reviewer_output_is_not_repaired() -> None:
    evaluator, transport, _ = make([ok(initial(flags=FLAGS)), ok("nonsense")])
    artifact, _ = await run(evaluator, prof=profile(reviewer=True))
    assert len(transport.requests) == 2
    assert {r.outcome for r in artifact.reviews} == {"failed"}
    assert artifact.status == "complete"


async def test_reviewer_skipped_without_remaining_budget() -> None:
    evaluator, transport, _ = make([ok(initial(flags=FLAGS))])
    b = budget(max_calls=1)
    artifact, _ = await run(
        evaluator, prof=profile(reviewer=True), bud=b, observer=InMemoryObserver(b)
    )
    assert len(transport.requests) == 1
    assert {r.outcome for r in artifact.reviews} == {"skipped"}
    assert artifact.reviews[0].limitations == ["review_budget_exhausted"]
    assert artifact.status == "complete"


async def test_no_trigger_means_no_review_and_disabled_policy_never_calls() -> None:
    evaluator, transport, _ = make([ok(initial())])
    artifact, _ = await run(evaluator, prof=profile(reviewer=True))
    assert artifact.reviews == [] and len(transport.requests) == 1
    evaluator, transport, _ = make([ok(initial(flags=FLAGS))])
    artifact, _ = await run(evaluator, prof=profile(reviewer=False))
    assert artifact.reviews == [] and len(transport.requests) == 1


def test_selection_skips_undetermined_and_unflagged_na() -> None:
    from cqa_contracts.models import CriterionProposal

    data = answer_all(
        CHECKLIST,
        CONV,
        undetermined=("c4_consultation",),
        not_applicable=("c2_needs",),
        flags={"c4_consultation": ["potential_violation"]},
    )
    proposals = [
        CriterionProposal.model_validate(
            {
                **{k: v for k, v in item.items() if k != "review_flags"},
                "review_reasons": item["review_flags"],
                "origin": "test",
            }
        )
        for item in data["criteria"]
    ]
    assert select_for_review(CHECKLIST, proposals, 5) == []
