"""Atomic import, revisions, verbatim source data and the organizer adapter."""

import json
import logging

import httpx
from conftest import chat_record, import_records, make_settings

SECRET_URL = "https://organizer.invalid/dataset?token=SECRET-TOKEN"


def conversations_total(client) -> int:
    return client.get("/api/v1/conversations").json()["total"]


def test_optional_empty_time_is_preserved_without_a_parse_warning(client):
    record = chat_record("paste-without-time")
    for message in record["messages"]:
        message["timestamp_original"] = ""
    result = import_records(client, record)["items"][0]
    body = client.get(f"/api/v1/conversations/{result['conversation_id']}").json()
    assert all(m["timestamp_original"] == "" and m["parsed_time"] is None for m in body["messages"])
    assert not any("source time not parsed" in warning for warning in body["warnings"])


def test_new_identical_and_changed_records_get_correct_dispositions(client):
    first = import_records(client, chat_record("new-id-never-seen"))
    item = first["items"][0]
    assert item["disposition"] == "created"
    assert item["revision"] == 1

    same = import_records(client, chat_record("new-id-never-seen"))
    assert same["items"][0]["disposition"] == "unchanged"
    assert same["items"][0]["conversation_id"] == item["conversation_id"]
    assert conversations_total(client) == 1

    changed_messages = chat_record("new-id-never-seen")
    changed_messages["messages"][1]["text"] = "Другой ответ"
    changed = import_records(client, changed_messages)
    assert changed["items"][0]["disposition"] == "new_revision"
    assert changed["items"][0]["revision"] == 2

    latest = client.get(f"/api/v1/conversations/{item['conversation_id']}").json()
    assert latest["revision"] == 2
    assert latest["messages"][1]["text"] == "Другой ответ"
    # The older revision stays available to evaluations that pinned it.
    old = client.get(
        f"/api/v1/conversations/{item['conversation_id']}", params={"revision": 1}
    ).json()
    assert old["messages"][1]["text"] == "Учебный ответ"
    assert old["content_hash"] != latest["content_hash"]
    missing = client.get(f"/api/v1/conversations/{item['conversation_id']}", params={"revision": 9})
    assert missing.status_code == 404


def test_one_bad_record_rejects_the_whole_payload(client):
    bad = chat_record("bad")
    bad["messages"][0]["speaker"] = "supervisor"
    response = client.post(
        "/api/v1/imports",
        json={"source": "json", "records": [chat_record("good"), bad]},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert {d["index"] for d in body["details"]} == {1}
    assert conversations_total(client) == 0


def test_identical_repeats_collapse_and_conflicting_repeats_fail(client):
    collapsed = import_records(client, chat_record("dup"), chat_record("dup"))
    assert collapsed["received_count"] == 2
    assert collapsed["deduplicated_count"] == 1
    assert collapsed["items"][0]["source_indices"] == [0, 1]

    other = chat_record("conflict")
    other["messages"][0]["text"] = "Иной текст"
    response = client.post(
        "/api/v1/imports",
        json={"source": "json", "records": [chat_record("conflict"), other, chat_record("fresh")]},
    )
    assert response.status_code == 422
    detail = response.json()["details"][0]
    assert detail["index"] == 1
    assert detail["reason"] == "conflicting_duplicate"
    assert conversations_total(client) == 1  # only "dup"; nothing from the rejected payload


def test_languages_channels_times_and_duplicate_lines_are_preserved(client):
    repeated = {"speaker": "operator", "text": "Сәлеметсіз бе", "timestamp_original": "00:05"}
    record = {
        "external_id": "kz-call",
        "channel": "voice_call",
        "language": "KZ",
        "messages": [
            {
                "speaker": "bot",
                "text": "Hello\n",
                "timestamp_original": "2026-01-02T03:04:05+05:00",
            },
            repeated,
            repeated,
            {"speaker": "system", "text": "", "timestamp_original": "not a time"},
            {"speaker": "client", "text": " ?? ", "timestamp_original": "2026-01-02T03:04:05"},
            {"speaker": "client", "text": "late", "timestamp_original": "00:03"},
        ],
    }
    conversation_id = import_records(client, record)["items"][0]["conversation_id"]
    body = client.get(f"/api/v1/conversations/{conversation_id}").json()
    messages = body["messages"]
    assert [m["id"] for m in messages] == [f"m000{i}" for i in range(1, 7)]
    assert [m["ordinal"] for m in messages] == [1, 2, 3, 4, 5, 6]
    assert [m["source_index"] for m in messages] == [0, 1, 2, 3, 4, 5]
    assert [m["text"] for m in messages] == [
        "Hello\n",
        "Сәлеметсіз бе",
        "Сәлеметсіз бе",
        "",
        " ?? ",
        "late",
    ]
    assert [m["timestamp_original"] for m in messages] == [
        "2026-01-02T03:04:05+05:00",
        "00:05",
        "00:05",
        "not a time",
        "2026-01-02T03:04:05",
        "00:03",
    ]
    assert messages[0]["parsed_time"] is not None
    # MM:SS never becomes an invented calendar date; a zone is never guessed.
    assert [m["parsed_time"] for m in messages[1:]] == [None] * 5
    assert body["occurred_at"] is None
    assert any(w.startswith("m0004") for w in body["warnings"])
    assert any(w.startswith("m0005") for w in body["warnings"])
    assert not any(w.startswith("m0002") for w in body["warnings"])
    assert not any("not a time" in w for w in body["warnings"])
    assert body["language"] == "KZ"
    assert body["channel"] == "voice_call"
    assert body["audio"]["availability"] == "unavailable"


def test_list_filters_and_pagination(client):
    import_records(
        client,
        chat_record("a", language="RU"),
        chat_record("b", language="KZ"),
        chat_record("c", language="EN", channel="voice_call"),
    )
    assert client.get("/api/v1/conversations").json()["total"] == 3
    assert client.get("/api/v1/conversations", params={"language": "KZ"}).json()["total"] == 1
    assert (
        client.get("/api/v1/conversations", params={"channel": "voice_call"}).json()["total"] == 1
    )
    page = client.get("/api/v1/conversations", params={"limit": 2, "offset": 2}).json()
    assert (page["total"], page["limit"], page["offset"], len(page["items"])) == (3, 2, 2, 1)
    assert client.get("/api/v1/conversations", params={"limit": 0}).status_code == 422
    assert client.get("/api/v1/conversations", params={"limit": 201}).status_code == 422
    assert (
        client.get("/api/v1/conversations", params={"status": "unevaluated"}).json()["total"] == 3
    )


def test_oversize_body_and_record_count_get_413(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path, import_max_bytes=2000))
    big = chat_record("big")
    big["messages"][0]["text"] = "x" * 3000
    response = client.post("/api/v1/imports", json={"source": "json", "records": [big]})
    assert response.status_code == 413
    assert response.json()["code"] == "payload_too_large"
    assert "xxx" not in response.text


def test_record_limit_gets_413(client):
    records = [chat_record(f"r{i}") for i in range(1001)]
    response = client.post("/api/v1/imports", json={"source": "json", "records": records})
    assert response.status_code == 413
    assert conversations_total(client) == 0


def test_invalid_input_is_never_echoed(client):
    response = client.post(
        "/api/v1/imports",
        json={"source": "json", "records": [chat_record("x")], "SECRET_KEY_NAME": "SECRET_VALUE"},
    )
    assert response.status_code == 422
    assert "SECRET_VALUE" not in response.text
    assert "SECRET_KEY_NAME" not in response.text


def organizer_client(client_factory, tmp_path, handler, **overrides):
    settings = make_settings(tmp_path, dataset_url=SECRET_URL, **overrides)
    return client_factory(settings, organizer_transport=httpx.MockTransport(handler))


def organizer_record(external_id="org-1", **overrides):
    record = {
        "id": external_id,
        "channel": "agent chat",
        "language": "ru",
        "messages": [
            {"role": "client", "text": "Вопрос", "timestamp": "00:01"},
            {"role": "operator", "text": "Ответ", "timestamp": "00:02"},
        ],
    }
    record.update(overrides)
    return record


def ok(*records):
    return {"isSuccess": True, "data": {"records": list(records)}}


def test_organizer_import_passes_only_group_id_and_keeps_url_secret(
    client_factory, tmp_path, caplog
):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json=ok(organizer_record()))

    client = organizer_client(client_factory, tmp_path, handler)
    with caplog.at_level(logging.DEBUG):
        response = client.post(
            "/api/v1/imports", json={"source": "organizer_api", "group_id": "any group"}
        )
    assert response.status_code == 201, response.text
    assert requests[0].url.params["group_id"] == "any group"
    assert requests[0].url.params["token"] == "SECRET-TOKEN"
    assert "SECRET-TOKEN" not in response.text
    assert "SECRET-TOKEN" not in caplog.text
    conversation = client.get(
        f"/api/v1/conversations/{response.json()['items'][0]['conversation_id']}"
    ).json()
    assert conversation["channel"] == "agent_chat"
    assert conversation["language"] == "RU"
    assert conversation["messages"][1]["speaker"] == "operator"


def test_organizer_rejects_arbitrary_url_field(client_factory, tmp_path):
    client = organizer_client(client_factory, tmp_path, lambda r: httpx.Response(500))
    response = client.post(
        "/api/v1/imports",
        json={"source": "organizer_api", "group_id": "g", "url": "http://127.0.0.1/"},
    )
    assert response.status_code == 422


def test_organizer_failures_map_to_safe_errors(client_factory, tmp_path):
    cases = [
        (httpx.Response(500, text="UPSTREAM-DETAIL"), 503, "provider_error"),
        (httpx.Response(429), 429, "provider_error"),
        (httpx.Response(200, text="not json UPSTREAM-DETAIL"), 503, "provider_error"),
        (httpx.Response(200, json={"isSuccess": False, "data": {}}), 503, "provider_error"),
        (httpx.Response(200, json={"isSuccess": True, "data": {}}), 503, "provider_error"),
        (httpx.Response(200, json=ok()), 422, "validation_error"),
    ]
    current = []

    def handler(request):
        return current[-1]

    client = organizer_client(client_factory, tmp_path, handler)
    for upstream, status, code in cases:
        current.append(upstream)
        response = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
        assert response.status_code == status, response.text
        assert response.json()["code"] == code
        assert "UPSTREAM-DETAIL" not in response.text
    assert conversations_total(client) == 0


def test_organizer_timeout_and_unreachable(client_factory, tmp_path):
    failures = [httpx.ConnectTimeout("t"), httpx.ConnectError("SECRET-TOKEN")]

    def handler(request):
        raise failures.pop(0)

    client = organizer_client(client_factory, tmp_path, handler)
    timeout = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    assert timeout.status_code == 504
    unreachable = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    assert unreachable.status_code == 503
    assert "SECRET-TOKEN" not in unreachable.text


def test_organizer_payload_size_limit(client_factory, tmp_path):
    body = json.dumps(ok(organizer_record())).encode() + b" " * 5000
    client = organizer_client(
        client_factory,
        tmp_path,
        lambda r: httpx.Response(200, content=body),
        import_max_bytes=1000,
    )
    response = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    assert response.status_code == 413


def test_organizer_atomicity_and_unknown_values_are_not_guessed(client_factory, tmp_path):
    bad_role = organizer_record("bad-role")
    bad_role["messages"][0]["role"] = "supervisor"
    bad_channel = organizer_record("bad-channel", channel="email")
    client = organizer_client(
        client_factory,
        tmp_path,
        lambda r: httpx.Response(200, json=ok(organizer_record("fine"), bad_role, bad_channel)),
    )
    response = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    assert response.status_code == 422
    assert {d["index"] for d in response.json()["details"]} == {1, 2}
    assert conversations_total(client) == 0


def test_missing_dataset_configuration_is_explicit(client):
    response = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    assert response.status_code == 503
    assert response.json()["code"] == "configuration_error"


def test_raw_record_and_audio_url_stay_private(client_factory, tmp_path):
    signed = "https://media.invalid/a.mp3?signature=SIGNED-VALUE"
    client = organizer_client(
        client_factory,
        tmp_path,
        lambda r: httpx.Response(200, json=ok(organizer_record(audio_url=signed))),
    )
    response = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    assert response.status_code == 201
    conversation_id = response.json()["items"][0]["conversation_id"]
    body = client.get(f"/api/v1/conversations/{conversation_id}")
    assert "SIGNED-VALUE" not in body.text
    assert "SIGNED-VALUE" not in client.get("/api/v1/conversations").text
    services = client.app.state.services
    with services.db.read() as conn:
        from cqa_api.db import row

        raw = row(conn, "SELECT raw_json FROM raw_import_records")
    assert json.loads(raw["raw_json"])["id"] == "org-1"
