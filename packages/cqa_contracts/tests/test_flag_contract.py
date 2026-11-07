"""Wire invariants for flag queries. U01-U04 still require B/C implementation."""

import pytest
from cqa_contracts.http_models import ConversationFlagSummary, ConversationSummary
from cqa_contracts.operations import create_contract_app
from fastapi.testclient import TestClient
from pydantic import ValidationError


@pytest.mark.parametrize("query", [
    "flag_status=detected",
    "flag_criterion_id=arbitrary",
    "flag_scope=effective",
    "checklist_version_id=v&flag_status=unknown",
    "checklist_version_id=v&flag_criterion_id=f&flag_status=false",
    "checklist_version_id=&flag_criterion_id=f",
])
def test_invalid_flag_queries_fail_with_safe_422(query):
    with TestClient(create_contract_app()) as client:
        response = client.get(f"/api/v1/conversations?{query}")
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.parametrize("query", [
    "", "checklist_version_id=v",
    "checklist_version_id=v&flag_criterion_id=arbitrary",
    "checklist_version_id=v&flag_criterion_id=arbitrary&flag_status=unknown&flag_scope=effective",
])
def test_valid_queries_reach_explicit_contract_placeholder(query):
    with TestClient(create_contract_app()) as client:
        response = client.get(f"/api/v1/conversations?{query}")
    assert response.status_code == 501


@pytest.mark.parametrize(("detected", "status"), [
    (True, "detected"), (False, "not_detected"), (None, "unknown"),
])
def test_flag_summary_reuses_tri_state_result(detected, status):
    # Status is a wire consistency check, never a second domain scorer.
    payload = dict(
        checklist_version_id="v", latest_job_id="j", scope="automatic", status=status,
        result=dict(criterion_id="arbitrary", detected=detected, answer_choice_id=None),
    )
    value = ConversationFlagSummary.model_validate(payload)
    assert value.result.detected is detected
    with pytest.raises(ValidationError):
        ConversationFlagSummary.model_validate(payload | {
            "status": "detected" if status != "detected" else "not_detected"
        })


def test_flag_summary_is_optional_for_existing_clients():
    assert ConversationSummary.model_fields["flag_summary"].default is None
    parameters = create_contract_app().openapi()["paths"]["/api/v1/conversations"]["get"][
        "parameters"
    ]
    assert {p["name"] for p in parameters} >= {
        "checklist_version_id", "flag_criterion_id", "flag_status", "flag_scope"
    }
    assert next(p for p in parameters if p["name"] == "flag_scope")["schema"]["default"] == "automatic"
