"""Integration bridge only. B replaces the 501 assertions with real query acceptance."""

import pytest


def test_existing_conversation_list_still_works(client):
    response = client.get("/api/v1/conversations")
    assert response.status_code == 200
    assert response.json()["items"] == []


@pytest.mark.parametrize("query", [
    "checklist_version_id=v",
    "checklist_version_id=v&flag_criterion_id=flag&flag_status=detected",
    "checklist_version_id=v&flag_criterion_id=flag&flag_scope=effective",
])
def test_requested_filter_is_not_silently_ignored_before_b_delivery(client, query):
    response = client.get(f"/api/v1/conversations?{query}")
    assert response.status_code == 501
    assert response.json()["code"] == "not_implemented"


def test_invalid_filter_combination_is_rejected(client):
    response = client.get("/api/v1/conversations?flag_status=not_detected")
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
