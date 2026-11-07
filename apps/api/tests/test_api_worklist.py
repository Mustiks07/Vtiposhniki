"""Work queues filter the complete server result before paging and keep run scope."""

from conftest import chat_record, import_records
from helpers import UNDETERMINED
from test_api_flag_contract import (
    FLAG,
    OTHER,
    appeal_and_change,
    build_world,
    evaluate,
    imported,
    names,
    rubric,
    search,
    start,
)


def test_worklist_search_score_sort_and_flags_before_paging(client_factory, tmp_path):
    world = build_world(client_factory, tmp_path)
    client = world.client
    ids = imported(client, *[f"case-{i:02}" for i in range(30)])
    version = rubric(client)
    world.plan["case-00"] = {FLAG: "violation", OTHER: "no"}
    world.plan["case-01"] = {OTHER: UNDETERMINED}
    evaluate(client, ids.values(), version)
    page = search(client, work_queue="flagged", limit=1)
    assert page["total"] == 1 and names(page) == ["case-00"]
    assert page["items"][0]["total_score"] == "0.00"
    assert page["items"][0]["detected_flag"] is True
    assert names(search(client, sort="score_asc", limit=1)) == ["case-00"]
    assert names(search(client, sort="score_desc", offset=29, limit=1)) == ["case-01"]
    assert names(search(client, max_score=20)) == ["case-00"]
    assert names(search(client, work_queue="needs_review")) == ["case-01"]
    assert names(search(client, q="CASE-00")) == ["case-00"]
    # Latest pending job hides an old score and flag; no historical match leaks through.
    start(client, [ids["case-00"]], version)
    assert search(client, work_queue="flagged")["total"] == 0
    assert search(client, max_score=20)["total"] == 0


def test_worklist_search_handles_ru_kz_and_literal_symbols(client_factory, tmp_path):
    world = build_world(client_factory, tmp_path)
    records = [chat_record(f"text-{n}") for n in range(28)]
    records[0]["messages"][0]["text"] = "ПРОВЕРЬТЕ ҚҰЖАТ 100%_"
    import_records(world.client, *records)
    for term in ("проверьте", "құжат", "100%_"):
        page = search(world.client, q=term, limit=1)
        assert names(page) == ["text-0"] and page["total"] == 1
    assert search(world.client, q="' OR 1=1 --")["total"] == 0


def test_open_appeal_queue_and_effective_score_use_selected_result(client_factory, tmp_path):
    world = build_world(client_factory, tmp_path)
    client = world.client
    ids = imported(client, "appealed")
    version = rubric(client)
    world.plan["appealed"] = {FLAG: "violation", OTHER: "no"}
    evaluate(client, ids.values(), version)
    item = search(client)["items"][0]
    eid = item["latest_evaluation_id"]
    opened = client.post(
        f"/api/v1/evaluations/{eid}/appeals",
        json={
            "criterion_id": OTHER,
            "comment": "Проверить ответ",
            "expected_revision": 1,
        },
    )
    assert opened.status_code == 201
    queue = search(client, work_queue="open_appeals")
    assert queue["total"] == 1 and queue["items"][0]["open_appeals"] == 1
    assert "open_appeal" in queue["items"][0]["review_reasons"]
    # A separate flag appeal can be decided while the score appeal remains open.
    appeal_and_change(client, eid, FLAG, "clean")
    automatic = search(client)["items"][0]
    effective = search(client, result_scope="effective")["items"][0]
    assert automatic["detected_flag"] is True
    assert effective["detected_flag"] is False
    assert effective["total_score"] == automatic["total_score"] == "0.00"
    assert search(client, result_scope="effective", work_queue="flagged")["total"] == 0


def test_preferred_profile_is_explicit_and_bad_filters_rejected(client_factory, tmp_path):
    world = build_world(client_factory, tmp_path, default_evaluator_profile="test-synthetic")
    profiles = world.client.get("/api/v1/evaluator-profiles").json()["items"]
    assert [p["profile"]["id"] for p in profiles if p["preferred"]] == ["test-synthetic"]
    for params in (
        {"max_score": 101},
        {"max_score": "nan"},
        {"q": "x" * 201},
        {"sort": "arbitrary"},
    ):
        assert world.client.get("/api/v1/conversations", params=params).status_code == 422
