"""Scoped flag search, docs/FLAG_FILTER_CONTRACT.md, including acceptance U01-U04.

Flags are computed by the real cqa_domain from the answers a test plans; no test asserts
a score. Everything runs against a temporary database and synthetic conversations.
"""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from conftest import (
    chat_record,
    create_batch,
    create_checklist,
    criterion,
    drain,
    import_records,
    make_settings,
)
from cqa_api.main import create_app
from fastapi.testclient import TestClient
from helpers import (
    NOT_APPLICABLE,
    UNDETERMINED,
    MutableClock,
    PlannedEvaluator,
    SpyDomain,
    add_profile,
    contract_error,
    illustrative_score,
)
from sqlalchemy import event, text

FLAG = "flag-x"
OTHER = "c1"


def flag_criterion(criterion_id=FLAG, **overrides):
    values = {
        "title": "Синтетический признак",
        "response_type": "flag",
        "weight": "0",
        "choices": [
            {"id": "clean", "label": "Нет", "raw_value": False, "anchor": "Нет признака",
             "score_fraction": None},
            {"id": "violation", "label": "Да", "raw_value": True, "anchor": "Есть признак",
             "score_fraction": None},
        ],
        "flag_when_choice_ids": ["violation"],
        **overrides,
    }
    return criterion(criterion_id, **values)


def rubric(client, *extra):
    return create_checklist(client, flag_criterion(), criterion(OTHER), *extra)


def build_world(client_factory, tmp_path, **settings):
    clock = MutableClock()
    evaluator = PlannedEvaluator(clock)
    client = client_factory(
        make_settings(tmp_path, **settings), evaluator=evaluator, clock=clock
    )
    return SimpleNamespace(client=client, plan=evaluator.plan, clock=clock)


@pytest.fixture
def world(client_factory, tmp_path):
    return build_world(client_factory, tmp_path)


def imported(client, *external_ids, **fields):
    items = import_records(client, *(chat_record(e, **fields) for e in external_ids))["items"]
    return {e: item["conversation_id"] for e, item in zip(external_ids, items, strict=True)}


def start(client, conversation_ids, version, **options):
    response = create_batch(
        client, list(conversation_ids), version["version_id"], key=uuid4().hex, **options
    )
    assert response.status_code == 202, response.text
    return [job["id"] for job in response.json()["jobs"]]


def evaluate(client, conversation_ids, version, **options):
    jobs = start(client, conversation_ids, version, **options)
    drain(client)
    return jobs


def search(client, version=None, criterion_id=None, **query):
    if version is not None:
        query["checklist_version_id"] = version["version_id"]
    if criterion_id is not None:
        query["flag_criterion_id"] = criterion_id
    response = client.get("/api/v1/conversations", params=query)
    assert response.status_code == 200, response.text
    return response.json()


def names(page):
    return [item["conversation"]["external_id"] for item in page["items"]]


def only(page):
    assert page["total"] == 1
    assert len(page["items"]) == 1
    return page["items"][0]


def job_state(client, job_id):
    return client.get(f"/api/v1/jobs/{job_id}").json()["state"]


def appeal_and_change(client, evaluation_id, criterion_id, answer, revision=1):
    appeal = client.post(
        f"/api/v1/evaluations/{evaluation_id}/appeals",
        json={"criterion_id": criterion_id, "comment": "Комментарий",
              "expected_revision": revision},
    )
    assert appeal.status_code == 201, appeal.text
    decision = client.post(
        f"/api/v1/appeals/{appeal.json()['id']}/decision",
        json={
            "expected_revision": revision,
            "decision": "changed",
            "reason": "Причина",
            "replacement": {
                "criterion_id": criterion_id,
                "applicability": "applicable",
                "answer_choice_id": answer,
                "rationale": "Обоснование проверяющего",
                "reason_codes": ["human_changed"],
                "evidence": [{
                    "kind": "message",
                    "message_ids": ["m0002"],
                    "relation": "support",
                    "explanation": "Пояснение",
                }],
                "origin": "human",
            },
        },
    )
    assert decision.status_code == 200, decision.text


# U01: the match is found wherever it sits, and paging and total are correct.


def test_u01_single_match_beyond_the_first_page(world):
    client = world.client
    external_ids = [f"conv-{n:02d}" for n in range(32)]
    conversations = imported(client, *external_ids)
    version = rubric(client)
    world.plan["conv-00"] = {FLAG: "violation"}
    evaluate(client, conversations.values(), version)

    newest_first = list(reversed(external_ids))
    unfiltered = search(client, limit=25)
    assert unfiltered["total"] == 32
    assert names(unfiltered) == newest_first[:25]
    assert "conv-00" not in names(unfiltered)

    found = search(client, version, FLAG, flag_status="detected", limit=25)
    assert names(found) == ["conv-00"]
    assert found["total"] == 1
    assert found["limit"] == 25
    assert found["offset"] == 0
    summary = found["items"][0]["flag_summary"]
    assert summary["status"] == "detected"
    assert summary["result"] == {
        "schema_version": "1.0",
        "criterion_id": FLAG,
        "detected": True,
        "answer_choice_id": "violation",
    }
    past_end = search(client, version, FLAG, flag_status="detected", limit=25, offset=25)
    assert past_end["items"] == []
    assert past_end["total"] == 1

    assert search(client, version, FLAG, flag_status="unknown")["total"] == 0


def test_u01_paging_keeps_total_and_order_without_duplicates(world):
    client = world.client
    external_ids = [f"conv-{n:02d}" for n in range(32)]
    conversations = imported(client, *external_ids)
    version = rubric(client)
    world.plan["conv-00"] = {FLAG: "violation"}
    evaluate(client, conversations.values(), version)

    expected = [e for e in reversed(external_ids) if e != "conv-00"]
    first = search(client, version, FLAG, flag_status="not_detected", limit=25)
    second = search(client, version, FLAG, flag_status="not_detected", limit=25, offset=25)
    assert first["total"] == second["total"] == 31
    assert names(first) + names(second) == expected
    assert len(second["items"]) == 6
    assert search(client, version, FLAG, flag_status="not_detected", limit=25) == first

    everything = search(client, version, FLAG, limit=25)
    assert everything["total"] == 32
    assert len(everything["items"]) == 25
    assert names(search(client, version, FLAG, limit=25, offset=25)) == [
        *expected[25:], "conv-00"
    ]


def test_u01_second_match_is_reached_by_paging(world):
    client = world.client
    conversations = imported(client, "a", "b", "c", "d")
    version = rubric(client)
    world.plan["a"] = world.plan["c"] = {FLAG: "violation"}
    evaluate(client, conversations.values(), version)
    first = search(client, version, FLAG, flag_status="detected", limit=1)
    second = search(client, version, FLAG, flag_status="detected", limit=1, offset=1)
    assert (first["total"], names(first)) == (2, ["c"])
    assert (second["total"], names(second)) == (2, ["a"])


def test_filters_combine_with_and_before_counting(world):
    client = world.client
    russian = imported(client, "ru-true", "ru-false", language="RU")
    english = imported(client, "en-true", "en-partial", language="EN")
    version = rubric(client)
    world.plan["ru-true"] = world.plan["en-true"] = {FLAG: "violation"}
    world.plan["en-partial"] = {FLAG: "violation", OTHER: UNDETERMINED}
    evaluate(client, [*russian.values(), *english.values()], version)

    assert names(search(client, version, FLAG, flag_status="detected", language="RU")) == [
        "ru-true"
    ]
    english_hits = search(client, version, FLAG, flag_status="detected", language="EN")
    assert (english_hits["total"], names(english_hits)) == (2, ["en-partial", "en-true"])
    partial = search(client, version, FLAG, flag_status="detected", status="partial")
    assert names(partial) == ["en-partial"]
    assert search(client, version, FLAG, flag_status="not_detected", language="EN")["total"] == 0
    assert search(client, version, FLAG, flag_status="detected", channel="voice_call")["total"] == 0


def test_total_and_page_read_one_snapshot(world):
    """A write landing between COUNT and the page must not change what this request sees."""
    client = world.client
    conversations = imported(client, "hit")
    version = rubric(client)
    world.plan["hit"] = {FLAG: "violation"}
    job = evaluate(client, conversations.values(), version)[0]
    db = client.app.state.services.db
    fired = []

    def overwrite_after_count(conn, cursor, statement, parameters, context, executemany):
        if "COUNT(*)" in statement and not fired:
            fired.append(True)
            with db.write() as writer:
                writer.execute(
                    text("UPDATE jobs SET state = 'queued', evaluation_id = NULL WHERE id = :id"),
                    {"id": job},
                )

    event.listen(db.reader, "after_cursor_execute", overwrite_after_count)
    try:
        during = search(client, version, FLAG, flag_status="detected")
    finally:
        event.remove(db.reader, "after_cursor_execute", overwrite_after_count)
    assert fired
    assert only(during)["flag_summary"]["status"] == "detected"
    assert search(client, version, FLAG, flag_status="detected")["total"] == 0


# U02: true survives partial; false is strictly apart from every kind of unknown.


def test_u02_every_state_maps_to_exactly_one_flag_status(client_factory, tmp_path):
    world = build_world(client_factory, tmp_path, retry_base_seconds=30, retry_max_seconds=30)
    client = world.client
    # name: (plan, evaluation_status, flag status, evaluation expected, answer)
    settled = {
        "true-complete": ({FLAG: "violation"}, "complete", "detected", True, "violation"),
        "true-partial": (
            {FLAG: "violation", OTHER: UNDETERMINED}, "partial", "detected", True, "violation"
        ),
        "false-complete": ({FLAG: "clean"}, "complete", "not_detected", True, "clean"),
        "false-partial": (
            {FLAG: "clean", OTHER: UNDETERMINED}, "partial", "not_detected", True, "clean"
        ),
        "flag-undetermined": ({FLAG: UNDETERMINED}, "partial", "unknown", True, None),
        "flag-not-applicable": ({FLAG: NOT_APPLICABLE}, "complete", "unknown", True, None),
        "artifact-failed": ("failed", "failed", "unknown", True, None),
        "job-failed": (contract_error(retryable=False), "failed", "unknown", False, None),
        "retry-wait": (contract_error(retryable=True), "pending", "unknown", False, None),
    }
    later = ["running", "queued", "no-job", "cancelled"]
    conversations = imported(client, *settled, *later)
    version = rubric(client)
    for name, (plan, *_) in settled.items():
        world.plan[name] = plan
    world.plan["cancelled"] = {FLAG: "violation"}
    cancelled_job = evaluate(
        client, [*(conversations[n] for n in settled), conversations["cancelled"]], version
    )[-1]
    # The storage never writes this state today; a stored result still must not show through.
    with client.app.state.services.db.write() as conn:
        conn.execute(text("UPDATE jobs SET state = 'cancelled' WHERE id = :id"),
                     {"id": cancelled_job})
    start(client, [conversations["running"]], version)
    queue = client.app.state.worker.queue
    assert queue.claim_next() is not None
    start(client, [conversations["queued"]], version)

    expected = {name: tuple(row[1:]) for name, row in settled.items()}
    expected["running"] = expected["queued"] = ("pending", "unknown", False, None)
    expected["no-job"] = ("unevaluated", "unknown", False, None)
    expected["cancelled"] = ("failed", "unknown", True, None)

    for scope in ("automatic", "effective"):
        page = search(client, version, FLAG, flag_scope=scope, limit=200)
        assert page["total"] == len(expected)
        seen = {}
        for item in page["items"]:
            summary = item["flag_summary"]
            assert summary["scope"] == scope
            assert summary["checklist_version_id"] == version["version_id"]
            assert summary["result"]["criterion_id"] == FLAG
            assert summary["result"]["detected"] is {
                "detected": True, "not_detected": False, "unknown": None
            }[summary["status"]]
            assert (summary["latest_job_id"] is None) == (
                item["conversation"]["external_id"] == "no-job"
            )
            seen[item["conversation"]["external_id"]] = (
                item["evaluation_status"],
                summary["status"],
                item["latest_evaluation_id"] is not None,
                summary["result"]["answer_choice_id"],
            )
        assert seen == expected

        for status in ("detected", "not_detected", "unknown"):
            matching = {name for name, row in expected.items() if row[1] == status}
            filtered = search(client, version, FLAG, flag_scope=scope, flag_status=status, limit=200)
            assert set(names(filtered)) == matching
            assert filtered["total"] == len(matching)


def test_u02_flag_missing_from_the_stored_score_is_unknown_not_false(client_factory, tmp_path):
    spy = SpyDomain()
    spy.result = illustrative_score().model_copy(update={"flags": []})
    clock = MutableClock()
    client = client_factory(
        make_settings(tmp_path), domain=spy.port, evaluator=PlannedEvaluator(clock), clock=clock
    )
    conversations = imported(client, "no-flag")
    version = rubric(client)
    evaluate(client, conversations.values(), version)
    item = only(search(client, version, FLAG, flag_status="unknown"))
    assert item["evaluation_status"] == "complete"
    assert item["latest_evaluation_id"] is not None
    assert item["flag_summary"]["result"] == {
        "schema_version": "1.0",
        "criterion_id": FLAG,
        "detected": None,
        "answer_choice_id": None,
    }
    assert search(client, version, FLAG, flag_status="not_detected")["total"] == 0


# U03: the explanation opens real messages; an appeal moves effective only.


def test_u03_explanation_opens_the_original_messages_of_the_evaluated_revision(world):
    client = world.client
    conversation_id = imported(client, "explained")["explained"]
    version = rubric(client)
    world.plan["explained"] = {FLAG: "violation"}
    evaluate(client, [conversation_id], version)

    item = only(search(client, version, FLAG, flag_status="detected"))
    view = client.get(f"/api/v1/evaluations/{item['latest_evaluation_id']}").json()
    assert view["conversation_id"] == conversation_id
    assert view["checklist_version_id"] == version["version_id"]
    assert item["flag_summary"]["result"] in view["automatic_score"]["flags"]
    proposal = next(p for p in view["artifact"]["automatic_final"] if p["criterion_id"] == FLAG)
    assert proposal["answer_choice_id"] == "violation"
    assert proposal["rationale"]
    evidence = proposal["evidence"][0]
    revision = view["conversation_revision"]
    original = client.get(
        f"/api/v1/conversations/{conversation_id}", params={"revision": revision}
    ).json()
    texts = {m["id"]: m["text"] for m in original["messages"]}
    assert texts[evidence["start_message_id"]] == "Учебный вопрос"
    assert texts[evidence["end_message_id"]] == "Учебный ответ"
    # The list row carries no second copy of the explanation.
    assert "rationale" not in item["flag_summary"]
    assert "evidence" not in item["flag_summary"]


@pytest.mark.parametrize(
    ("automatic", "human", "before", "after"),
    [
        ("violation", "clean", "detected", "not_detected"),
        ("clean", "violation", "not_detected", "detected"),
    ],
)
def test_u03_appeal_changes_effective_and_never_automatic(world, automatic, human, before, after):
    client = world.client
    conversation_id = imported(client, "appealed")["appealed"]
    version = rubric(client)
    world.plan["appealed"] = {FLAG: automatic}
    evaluate(client, [conversation_id], version)
    first = only(search(client, version, FLAG))
    assert first["flag_summary"]["scope"] == "automatic"
    assert only(search(client, version, FLAG, flag_scope="effective"))["flag_summary"][
        "status"
    ] == before
    stored = client.get(f"/api/v1/evaluations/{first['latest_evaluation_id']}").json()

    appeal_and_change(client, first["latest_evaluation_id"], FLAG, human)

    automatic_row = only(search(client, version, FLAG, flag_scope="automatic"))
    effective_row = only(search(client, version, FLAG, flag_scope="effective"))
    assert automatic_row["flag_summary"]["status"] == before
    assert automatic_row["flag_summary"]["result"]["answer_choice_id"] == automatic
    assert effective_row["flag_summary"]["status"] == after
    assert effective_row["flag_summary"]["result"]["answer_choice_id"] == human
    assert automatic_row["latest_evaluation_id"] == effective_row["latest_evaluation_id"]
    assert automatic_row["latest_evaluation_id"] == first["latest_evaluation_id"]

    for scope, matching in (("automatic", before), ("effective", after)):
        assert search(client, version, FLAG, flag_scope=scope, flag_status=matching)["total"] == 1
        other = "detected" if matching == "not_detected" else "not_detected"
        assert search(client, version, FLAG, flag_scope=scope, flag_status=other)["total"] == 0

    view = client.get(f"/api/v1/evaluations/{first['latest_evaluation_id']}").json()
    assert view["artifact"] == stored["artifact"]
    assert view["automatic_score"] == stored["automatic_score"]
    assert effective_row["flag_summary"]["result"] in view["effective_score"]["flags"]


def test_u03_true_survives_a_partial_while_effective_completes(world):
    client = world.client
    conversation_id = imported(client, "partial")["partial"]
    version = rubric(client)
    world.plan["partial"] = {FLAG: "violation", OTHER: UNDETERMINED}
    evaluate(client, [conversation_id], version)
    item = only(search(client, version, FLAG, flag_status="detected"))
    assert item["evaluation_status"] == "partial"

    appeal_and_change(client, item["latest_evaluation_id"], OTHER, "yes")

    view = client.get(f"/api/v1/evaluations/{item['latest_evaluation_id']}").json()
    assert view["automatic_score"]["status"] == "incomplete_evaluation"
    assert view["effective_score"]["status"] == "complete"
    for scope in ("automatic", "effective"):
        row = only(search(client, version, FLAG, flag_scope=scope, flag_status="detected"))
        assert row["evaluation_status"] == "partial"  # follows the artifact in every scope


def test_u03_human_answer_settles_an_undetermined_flag_in_effective_only(world):
    client = world.client
    conversation_id = imported(client, "open")["open"]
    version = rubric(client)
    world.plan["open"] = {FLAG: UNDETERMINED}
    evaluate(client, [conversation_id], version)
    item = only(search(client, version, FLAG, flag_status="unknown"))

    appeal_and_change(client, item["latest_evaluation_id"], FLAG, "violation")

    assert search(client, version, FLAG, flag_scope="automatic", flag_status="unknown")["total"] == 1
    assert search(client, version, FLAG, flag_scope="automatic", flag_status="detected")["total"] == 0
    assert search(client, version, FLAG, flag_scope="effective", flag_status="detected")["total"] == 1
    assert search(client, version, FLAG, flag_scope="effective", flag_status="unknown")["total"] == 0


# U04: arbitrary IDs; version and revision scoping; a new run overrides the old result.


def test_u04_arbitrary_flag_id_and_no_guessing_from_title_number_or_score(world):
    client = world.client
    odd_id = "x.$[0]\"'%_ флаг"
    conversations = imported(client, "hit", "miss")
    version = create_checklist(
        client,
        flag_criterion(odd_id, title="Нейтральное название"),
        flag_criterion("second-flag", title="Другое название"),
        criterion("8", title="Грубые ошибки"),
    )
    world.plan["hit"] = {odd_id: "violation", "second-flag": "clean", "8": "no"}
    world.plan["miss"] = {odd_id: "clean", "second-flag": "violation", "8": "no"}
    evaluate(client, conversations.values(), version)

    assert names(search(client, version, odd_id, flag_status="detected")) == ["hit"]
    assert names(search(client, version, odd_id, flag_status="not_detected")) == ["miss"]
    assert names(search(client, version, "second-flag", flag_status="detected")) == ["miss"]
    assert names(search(client, version, "second-flag", flag_status="not_detected")) == ["hit"]

    # ID 8 and the title "Грубые ошибки" carry no meaning: this one is not a flag.
    rejected = client.get(
        "/api/v1/conversations",
        params={"checklist_version_id": version["version_id"], "flag_criterion_id": "8"},
    )
    assert rejected.status_code == 422


def test_u04_selected_version_decides_and_is_not_replaced_by_the_latest(world):
    client = world.client
    conversation_id = imported(client, "versions")["versions"]
    older = rubric(client)
    newer = rubric(client)
    unused = rubric(client)
    world.plan["versions"] = {FLAG: "violation"}
    evaluate(client, [conversation_id], older)
    world.plan["versions"] = {FLAG: "clean"}
    evaluate(client, [conversation_id], newer)

    in_older = only(search(client, older, FLAG, flag_status="detected"))
    in_newer = only(search(client, newer, FLAG, flag_status="not_detected"))
    assert in_older["latest_evaluation_id"] != in_newer["latest_evaluation_id"]
    assert in_older["flag_summary"]["latest_job_id"] != in_newer["flag_summary"]["latest_job_id"]
    assert client.get(
        f"/api/v1/evaluations/{in_older['latest_evaluation_id']}"
    ).json()["checklist_version_id"] == older["version_id"]

    # Without a version, the latest run across all checklists, and no flag summary.
    latest = only(search(client))
    assert latest["latest_evaluation_id"] == in_newer["latest_evaluation_id"]
    assert latest["flag_summary"] is None

    # A version alone selects the run, but neither filters nor summarises.
    only_version = only(search(client, older))
    assert only_version["latest_evaluation_id"] == in_older["latest_evaluation_id"]
    assert only_version["flag_summary"] is None

    # No run of this version: the conversation stays, as unknown, with no borrowed result.
    missing = only(search(client, unused, FLAG, flag_status="unknown"))
    assert missing["evaluation_status"] == "unevaluated"
    assert missing["latest_evaluation_id"] is None
    assert missing["flag_summary"]["latest_job_id"] is None
    assert missing["flag_summary"]["result"]["detected"] is None

    # A pending run of another version does not hide this version's result.
    start(client, [conversation_id], newer)
    assert only(search(client, older, FLAG))["flag_summary"]["status"] == "detected"
    assert only(search(client, newer, FLAG))["evaluation_status"] == "pending"


def test_u04_new_revision_starts_unknown_and_old_result_stays_readable(world):
    client = world.client
    conversation_id = imported(client, "revised")["revised"]
    version = rubric(client)
    world.plan["revised"] = {FLAG: "violation"}
    evaluate(client, [conversation_id], version)
    old_evaluation = only(search(client, version, FLAG))["latest_evaluation_id"]

    changed = chat_record("revised")
    changed["messages"][1]["text"] = "Изменённый учебный ответ"
    imported_again = import_records(client, changed)["items"][0]
    assert imported_again["conversation_id"] == conversation_id
    assert imported_again["revision"] == 2

    assert search(client, version, FLAG, flag_status="detected")["total"] == 0
    item = only(search(client, version, FLAG, flag_status="unknown"))
    assert item["conversation"]["revision"] == 2
    assert item["evaluation_status"] == "unevaluated"
    assert item["latest_evaluation_id"] is None
    assert item["flag_summary"]["latest_job_id"] is None

    view = client.get(f"/api/v1/evaluations/{old_evaluation}").json()
    assert view["conversation_revision"] == 1
    assert client.get(
        f"/api/v1/conversations/{conversation_id}", params={"revision": 1}
    ).json()["messages"][1]["text"] == "Учебный ответ"

    world.plan["revised"] = {FLAG: "clean"}
    evaluate(client, [conversation_id], version)
    current = only(search(client, version, FLAG, flag_status="not_detected"))
    assert current["conversation"]["revision"] == 2
    assert current["latest_evaluation_id"] != old_evaluation
    assert client.get(
        f"/api/v1/evaluations/{current['latest_evaluation_id']}"
    ).json()["conversation_revision"] == 2


@pytest.mark.parametrize(
    ("plan", "drained", "evaluation_status", "flag_status", "new_evaluation"),
    [
        (None, False, "pending", "unknown", False),
        (contract_error(retryable=False), True, "failed", "unknown", False),
        ("failed", True, "failed", "unknown", True),
        ({FLAG: "clean"}, True, "complete", "not_detected", True),
        ({FLAG: UNDETERMINED}, True, "partial", "unknown", True),
        ({FLAG: "violation"}, True, "complete", "detected", True),
    ],
    ids=["pending", "failed-job", "failed-artifact", "false", "undetermined", "true-again"],
)
def test_u04_new_run_replaces_the_old_true_without_a_duplicate_row(
    world, plan, drained, evaluation_status, flag_status, new_evaluation
):
    client = world.client
    conversation_id = imported(client, "rerun")["rerun"]
    version = rubric(client)
    world.plan["rerun"] = {FLAG: "violation"}
    evaluate(client, [conversation_id], version)
    old = only(search(client, version, FLAG, flag_status="detected"))

    world.plan["rerun"] = plan
    job = start(client, [conversation_id], version)[0]
    if drained:
        drain(client)

    item = only(search(client, version, FLAG, limit=25))
    assert item["evaluation_status"] == evaluation_status
    assert item["flag_summary"]["status"] == flag_status
    assert item["flag_summary"]["latest_job_id"] == job
    assert (item["latest_evaluation_id"] is not None) == new_evaluation
    assert item["latest_evaluation_id"] != old["latest_evaluation_id"]
    expected_hits = 1 if flag_status == "detected" else 0
    assert search(client, version, FLAG, flag_status="detected")["total"] == expected_hits
    assert search(client, version, FLAG, flag_status=flag_status)["total"] == 1
    # The earlier evaluation is history: still readable, never selected again.
    assert client.get(f"/api/v1/evaluations/{old['latest_evaluation_id']}").status_code == 200


def test_u04_repeated_runs_keep_one_row_and_manual_retry_is_pending_again(world):
    client = world.client
    conversation_id = imported(client, "repeat")["repeat"]
    version = rubric(client)
    for answer in ("violation", "clean", "violation", "clean"):
        world.plan["repeat"] = {FLAG: answer}
        evaluate(client, [conversation_id], version)
    assert only(search(client, version, FLAG))["flag_summary"]["status"] == "not_detected"

    world.plan["repeat"] = contract_error(retryable=False)
    job = evaluate(client, [conversation_id], version)[0]
    assert only(search(client, version, FLAG))["evaluation_status"] == "failed"

    assert client.post(f"/api/v1/jobs/{job}/retry").status_code == 202
    assert only(search(client, version, FLAG))["evaluation_status"] == "pending"

    world.plan["repeat"] = {FLAG: "violation"}
    drain(client)
    item = only(search(client, version, FLAG, flag_status="detected"))
    assert item["flag_summary"]["latest_job_id"] == job


def test_u04_failed_artifact_can_be_retried_after_the_flag_was_unknown(world):
    client = world.client
    conversation_id = imported(client, "retry-artifact")["retry-artifact"]
    version = rubric(client)
    world.plan["retry-artifact"] = "failed"
    job = evaluate(client, [conversation_id], version)[0]
    failed = only(search(client, version, FLAG, flag_status="unknown"))
    assert failed["latest_evaluation_id"] is not None

    assert client.post(f"/api/v1/jobs/{job}/retry").status_code == 202
    world.plan["retry-artifact"] = {FLAG: "violation"}
    drain(client)
    assert job_state(client, job) == "succeeded"
    item = only(search(client, version, FLAG, flag_status="detected"))
    assert item["latest_evaluation_id"] != failed["latest_evaluation_id"]


def test_u04_new_run_of_a_compatible_result_starts_effective_afresh(world):
    client = world.client
    conversation_id = imported(client, "reused")["reused"]
    version = rubric(client)
    world.plan["reused"] = {FLAG: "violation"}
    evaluate(client, [conversation_id], version)
    first = only(search(client, version, FLAG))
    appeal_and_change(client, first["latest_evaluation_id"], FLAG, "clean")
    assert only(search(client, version, FLAG, flag_scope="effective"))["flag_summary"][
        "status"
    ] == "not_detected"

    evaluate(client, [conversation_id], version, mode="reuse_if_compatible")

    reused = only(search(client, version, FLAG, flag_scope="effective"))
    assert reused["latest_evaluation_id"] != first["latest_evaluation_id"]
    view = client.get(f"/api/v1/evaluations/{reused['latest_evaluation_id']}").json()
    assert view["reuse"]["reused_from_evaluation_id"] == first["latest_evaluation_id"]
    assert view["human_decisions"] == []
    # Only the selected job's evaluation counts: the old decision belongs to the old one.
    assert reused["flag_summary"]["status"] == "detected"


def test_u04_last_started_run_wins_across_profiles_of_the_version(world):
    client = world.client
    conversation_id = imported(client, "profiles")["profiles"]
    version = rubric(client)
    world.plan["profiles"] = {FLAG: "violation"}
    evaluate(client, [conversation_id], version)
    add_profile(client, version="v2")
    world.plan["profiles"] = {FLAG: "clean"}
    evaluate(client, [conversation_id], version)
    item = only(search(client, version, FLAG))
    assert item["flag_summary"]["status"] == "not_detected"
    view = client.get(f"/api/v1/evaluations/{item['latest_evaluation_id']}").json()
    assert view["profile_version"] == "v2"


# Recovery and the shared test clock stay intact under the selection.


def test_expired_lease_recovers_through_pending_and_replaces_the_result(world):
    client = world.client
    conversation_id = imported(client, "recover")["recover"]
    version = rubric(client)
    world.plan["recover"] = {FLAG: "violation"}
    evaluate(client, [conversation_id], version)

    world.plan["recover"] = {FLAG: "clean"}
    job = start(client, [conversation_id], version)[0]
    assert client.app.state.worker.queue.claim_next() is not None  # the worker dies here
    assert only(search(client, version, FLAG, flag_status="unknown"))["evaluation_status"] == "pending"

    world.clock.advance(client.app.state.services.settings.lease_seconds + 1)
    assert only(search(client, version, FLAG, flag_status="unknown"))["evaluation_status"] == "pending"
    assert drain(client) == 1
    assert job_state(client, job) == "succeeded"
    assert only(search(client, version, FLAG, flag_status="not_detected"))["evaluation_status"] == (
        "complete"
    )
    assert search(client, version, FLAG, flag_status="detected")["total"] == 0


def test_selection_and_decisions_survive_a_restart(tmp_path):
    clock = MutableClock()
    evaluator = PlannedEvaluator(clock)
    settings = make_settings(tmp_path)
    with TestClient(create_app(settings, evaluator=evaluator, clock=clock)) as client:
        conversation_id = imported(client, "restart")["restart"]
        version = rubric(client)
        evaluator.plan["restart"] = {FLAG: "violation"}
        evaluate(client, [conversation_id], version)
        evaluation_id = only(search(client, version, FLAG))["latest_evaluation_id"]
        appeal_and_change(client, evaluation_id, FLAG, "clean")
        start(client, [imported(client, "unfinished")["unfinished"]], version)
    with TestClient(create_app(settings, evaluator=evaluator, clock=clock)) as client:
        hit = only(search(client, version, FLAG, flag_status="detected"))
        assert hit["latest_evaluation_id"] == evaluation_id
        assert only(search(client, version, FLAG, flag_scope="effective",
                           flag_status="not_detected"))["latest_evaluation_id"] == evaluation_id
        assert only(search(client, version, FLAG, flag_status="unknown"))[
            "evaluation_status"
        ] == "pending"
        drain(client)
        assert search(client, version, FLAG, flag_status="not_detected")["total"] == 1


@pytest.mark.parametrize("year", [2001, 2099])
def test_results_do_not_depend_on_the_calendar(client_factory, tmp_path, year):
    world = build_world(client_factory, tmp_path)
    world.clock.now = datetime(year, 1, 1, tzinfo=UTC)
    conversation_id = imported(world.client, "dated")["dated"]
    version = rubric(world.client)
    world.plan["dated"] = {FLAG: "violation"}
    job = evaluate(world.client, [conversation_id], version)[0]
    assert job_state(world.client, job) == "succeeded"
    item = only(search(world.client, version, FLAG, flag_status="detected"))
    view = world.client.get(f"/api/v1/evaluations/{item['latest_evaluation_id']}").json()
    assert view["artifact"]["calls"][0]["started_at"].startswith(str(year))


# Query validation and the unchanged behaviour without the new parameters.


def test_existing_conversation_list_still_works(client):
    response = client.get("/api/v1/conversations")
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_no_new_parameters_keep_the_previous_meaning(world):
    client = world.client
    conversations = imported(client, "plain", "untouched")
    version = rubric(client)
    world.plan["plain"] = {FLAG: "violation"}
    evaluate(client, [conversations["plain"]], version)
    page = search(client)
    assert page["total"] == 2
    assert names(page) == ["untouched", "plain"]
    assert [i["evaluation_status"] for i in page["items"]] == ["unevaluated", "complete"]
    assert all(i["flag_summary"] is None for i in page["items"])
    assert search(client, flag_scope="automatic") == page
    assert names(search(client, status="complete")) == ["plain"]


@pytest.mark.parametrize(
    "query",
    [
        "flag_status=not_detected",
        "flag_status=detected",
        "flag_criterion_id=flag",
        "flag_scope=effective",
        "checklist_version_id=v&flag_status=unknown",
        "checklist_version_id=v&flag_scope=effective",
        "checklist_version_id=v&flag_criterion_id=flag&flag_status=false",
        "checklist_version_id=v&flag_criterion_id=flag&flag_scope=human",
        "checklist_version_id=&flag_criterion_id=flag",
        "checklist_version_id=v&flag_criterion_id=",
        f"checklist_version_id={'v' * 201}",
        f"checklist_version_id=v&flag_criterion_id={'f' * 201}",
    ],
)
def test_invalid_query_shape_is_a_safe_422(client, query):
    response = client.get(f"/api/v1/conversations?{query}")
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_error"


@pytest.mark.parametrize(
    "extra", ["", "&flag_criterion_id=flag", "&flag_criterion_id=flag&flag_status=detected"]
)
def test_unknown_version_is_404_and_not_an_empty_page(client, extra):
    response = client.get(f"/api/v1/conversations?checklist_version_id=absent{extra}")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_criterion_must_be_a_flag_of_the_selected_version(world):
    client = world.client
    version = rubric(client)
    other = create_checklist(client, flag_criterion("only-there"), criterion(OTHER))
    for bad in (OTHER, "absent", "only-there", "' OR 1=1 --"):
        response = client.get(
            "/api/v1/conversations",
            params={"checklist_version_id": version["version_id"], "flag_criterion_id": bad},
        )
        assert response.status_code == 422, bad
        assert response.json()["code"] == "validation_error"
        assert response.json()["details"][0]["field"] == "flag_criterion_id"
        assert bad not in response.json()["message"]  # fixed text, input is never echoed
    assert search(client, other, "only-there")["total"] == 0
