"""Audio: allowlist, redirect and address checks, ranges, limits, no signed URL leaks."""

import json
import logging

import httpx
import pytest
from conftest import make_settings
from cqa_api.audio import MAX_AUDIO_PAGE_BYTES, _record_state
from cqa_api.db import row, run

ALLOWED = "media.example.test"
SIGNED = f"https://{ALLOWED}/a.mp3?signature=SIGNED-VALUE"
AUDIO = bytes(range(256)) * 40


def public_resolver(host):
    return ["93.184.216.34"]


def organizer_payload(audio_url=SIGNED, external_id="call-1"):
    return {
        "isSuccess": True,
        "data": {
            "records": [
                {
                    "id": external_id,
                    "channel": "voice call",
                    "language": "ru",
                    "audio_url": audio_url,
                    "messages": [
                        {"role": "client", "text": "Вопрос", "timestamp": "00:01"},
                        {"role": "operator", "text": "Ответ", "timestamp": "00:02"},
                    ],
                }
            ]
        },
    }


def audio_client(
    client_factory, tmp_path, handler, *, resolver=public_resolver, audio_url=SIGNED, **overrides
):
    values = {
        "dataset_url": "https://organizer.invalid/d",
        "audio_allowed_hosts": ALLOWED,
    }
    values.update(overrides)
    client = client_factory(
        make_settings(tmp_path, **values),
        organizer_transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json=organizer_payload(audio_url))
        ),
        audio_transport=httpx.MockTransport(handler),
        host_resolver=resolver,
    )
    imported = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    assert imported.status_code == 201, imported.text
    conversation_id = imported.json()["items"][0]["conversation_id"]
    return client, conversation_id


def serve(request):
    range_header = request.headers.get("range")
    if range_header == "bytes=0-9":
        return httpx.Response(
            206,
            content=AUDIO[:10],
            headers={
                "content-type": "audio/mpeg",
                "content-range": f"bytes 0-9/{len(AUDIO)}",
                "content-length": "10",
            },
        )
    if range_header == "bytes=999999-":
        return httpx.Response(416)
    return httpx.Response(
        200,
        content=AUDIO,
        headers={"content-type": "audio/mpeg; x=y", "content-length": str(len(AUDIO))},
    )


def test_streams_bytes_and_confirms_availability(client_factory, tmp_path):
    client, conversation_id = audio_client(client_factory, tmp_path, serve)
    before = client.get(f"/api/v1/conversations/{conversation_id}").json()
    assert before["audio"]["availability"] == "unknown"
    assert before["audio"]["access_path"] == f"/api/v1/conversations/{conversation_id}/audio"
    assert before["audio"]["alignment_status"] == "unverified"
    assert before["audio"]["mapping"] is None

    response = client.get(before["audio"]["access_path"])
    assert response.status_code == 200
    assert response.content == AUDIO
    assert response.headers["content-type"].startswith("audio/mpeg")
    assert response.headers["accept-ranges"] == "bytes"
    assert "SIGNED-VALUE" not in str(response.headers)

    after = client.get(f"/api/v1/conversations/{conversation_id}").json()
    assert after["audio"]["availability"] == "available"
    assert after["audio"]["media_type"] == "audio/mpeg"
    assert after["content_hash"] == before["content_hash"]  # metadata is not content


def test_late_source_and_rotated_source_refresh_metadata_without_a_text_revision(
    client_factory, tmp_path
):
    payload = [organizer_payload(None)]
    client = client_factory(
        make_settings(
            tmp_path, dataset_url="https://organizer.invalid/d", audio_allowed_hosts=ALLOWED
        ),
        organizer_transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload[0])),
        audio_transport=httpx.MockTransport(serve),
        host_resolver=public_resolver,
    )

    def imported(url):
        payload[0] = organizer_payload(url)
        response = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
        assert response.status_code == 201
        return response.json()["items"][0]

    first = imported(None)
    cid = first["conversation_id"]
    endpoint = f"/api/v1/conversations/{cid}"
    original = client.get(endpoint).json()
    assert original["audio"]["access_path"] is None
    for url in (SIGNED, f"https://{ALLOWED}/rotated.mp3?signature=ROTATED"):
        result = imported(url)
        assert result["disposition"] == "unchanged"
        assert result["revision"] == 1
        # Check persisted JSON too: read compatibility must not mask an import failure.
        with client.app.state.services.db.read() as conn:
            stored = row(
                conn,
                "SELECT document_json FROM conversation_revisions WHERE conversation_id=:id",
                {"id": cid},
            )
        document = json.loads(stored["document_json"])
        assert document["audio"]["access_path"] == endpoint + "/audio"
        assert document["audio"]["availability"] == "unknown"
        assert document["audio"]["alignment_status"] == "unverified"
        assert document["audio"]["mapping"] is None
        assert document["content_hash"] == original["content_hash"]
        assert url not in stored["document_json"]
        assert client.get(endpoint + "/audio").status_code == 200
        assert client.get(endpoint).json()["audio"]["availability"] == "available"
        if url == SIGNED:
            verified = client.get(endpoint).json()
            verified["audio"].update(
                alignment_status="verified",
                mapping=[
                    {
                        "schema_version": "1.0",
                        "message_id": "m0001",
                        "start_seconds": "0",
                        "end_seconds": None,
                    }
                ],
            )
            with client.app.state.services.db.write() as conn:
                run(
                    conn,
                    "UPDATE conversation_revisions SET document_json=:document WHERE conversation_id=:id",
                    {"document": json.dumps(verified), "id": cid},
                )
        # Same source or an omitted source does not erase a known working recording.
        imported(url)
        imported(None)
        assert client.get(endpoint).json()["audio"]["availability"] == "available"
        if url == SIGNED:
            assert client.get(endpoint).json()["audio"]["alignment_status"] == "verified"


def test_source_policy_changes_do_not_retain_stale_paths_or_warnings(client_factory, tmp_path):
    payload = [organizer_payload("https://not-allowed.example/a.mp3")]
    client = client_factory(
        make_settings(
            tmp_path, dataset_url="https://organizer.invalid/d", audio_allowed_hosts=ALLOWED
        ),
        organizer_transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload[0])),
        audio_transport=httpx.MockTransport(serve),
        host_resolver=public_resolver,
    )
    for url, allowed in (
        ("https://not-allowed.example/a.mp3", False),
        (SIGNED, True),
        ("https://not-allowed.example/other.mp3", False),
    ):
        payload[0] = organizer_payload(url)
        response = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
        cid = response.json()["items"][0]["conversation_id"]
        document = client.get(f"/api/v1/conversations/{cid}").json()
        assert (document["audio"]["access_path"] is not None) is allowed
        assert bool(document["warnings"]) is not allowed
        assert url not in str(document)
        assert document["revision"] == 1


def test_old_late_source_record_is_readable_and_repaired_by_successful_stream(
    client_factory, tmp_path
):
    client, cid = audio_client(client_factory, tmp_path, serve)
    endpoint = f"/api/v1/conversations/{cid}"
    original = client.get(endpoint).json()
    # Simulate a database made by the old importer: private source present, public path absent.
    broken = {
        **original,
        "audio": {
            **original["audio"],
            "access_path": None,
            "availability": "unavailable",
            "alignment_status": "unavailable",
        },
    }
    with client.app.state.services.db.write() as conn:
        run(
            conn,
            "UPDATE conversation_revisions SET document_json=:document WHERE conversation_id=:id",
            {"document": json.dumps(broken), "id": cid},
        )
    offered = client.get(endpoint).json()
    assert offered["audio"]["access_path"] == endpoint + "/audio"
    assert offered["audio"]["availability"] == "unknown"
    assert offered["audio"]["mapping"] is None
    assert offered["content_hash"] == original["content_hash"]
    assert SIGNED not in str(offered)
    assert client.get(offered["audio"]["access_path"]).status_code == 200
    with client.app.state.services.db.read() as conn:
        stored = row(
            conn,
            "SELECT document_json FROM conversation_revisions WHERE conversation_id=:id",
            {"id": cid},
        )
    repaired = json.loads(stored["document_json"])
    assert repaired["audio"]["availability"] == "available"
    assert repaired["audio"]["access_path"] == endpoint + "/audio"
    assert repaired["audio"]["alignment_status"] == "unverified"


def test_late_audio_response_cannot_overwrite_metadata_of_a_replaced_source(
    client_factory, tmp_path
):
    client, cid = audio_client(client_factory, tmp_path, serve)
    services = client.app.state.services
    replacement = f"https://{ALLOWED}/replacement.mp3"
    with services.db.write() as conn:
        run(
            conn,
            "UPDATE conversation_revisions SET audio_source_url=:url WHERE conversation_id=:id",
            {"url": replacement, "id": cid},
        )
    # An in-flight request for SIGNED completes after the replacement was stored.
    _record_state(services, cid, 1, SIGNED, True, "audio/mpeg")
    assert client.get(f"/api/v1/conversations/{cid}").json()["audio"]["availability"] == "unknown"
    _record_state(services, cid, 1, replacement, True, "audio/mpeg")
    assert client.get(f"/api/v1/conversations/{cid}").json()["audio"]["availability"] == "available"


def test_range_requests(client_factory, tmp_path):
    client, conversation_id = audio_client(client_factory, tmp_path, serve)
    partial = client.get(
        f"/api/v1/conversations/{conversation_id}/audio", headers={"Range": "bytes=0-9"}
    )
    assert partial.status_code == 206
    assert partial.content == AUDIO[:10]
    assert partial.headers["content-range"] == f"bytes 0-9/{len(AUDIO)}"
    for invalid in ("bytes=a-b", "items=0-1", "bytes=0-1,5-6", "bytes="):
        response = client.get(
            f"/api/v1/conversations/{conversation_id}/audio", headers={"Range": invalid}
        )
        assert response.status_code == 416, invalid
        assert response.json()["correlation_id"]
    unsatisfiable = client.get(
        f"/api/v1/conversations/{conversation_id}/audio", headers={"Range": "bytes=999999-"}
    )
    assert unsatisfiable.status_code == 416


def test_audio_page_entities_redirects_seek_and_unsatisfied_range(client_factory, tmp_path):
    page_host = "pages.example.test"
    requested = []

    def handler(request):
        requested.append((request.url.host, request.url.path, request.headers.get("range")))
        if request.url.host == page_host:
            if request.url.path == "/page":
                return httpx.Response(302, headers={"location": "/watch"})
            return httpx.Response(
                200,
                text=f'<audio><source src="https://{ALLOWED}/signed?token=SIGNED-VALUE&amp;x=1"></audio>'
                '<script>location="https://evil.example/never"</script>',
                headers={"content-type": "text/html; charset=utf-8"},
            )
        if request.url.path == "/signed":
            assert request.url.params["x"] == "1"
            return httpx.Response(302, headers={"location": "/resolved.mp3"})
        span = request.headers["range"].removeprefix("bytes=").split("-")
        first, last = int(span[0]), int(span[1]) if span[1] else len(AUDIO) - 1
        if first >= len(AUDIO):
            return httpx.Response(416, headers={"content-range": f"bytes */{len(AUDIO)}"})
        return httpx.Response(
            206,
            content=AUDIO[first : last + 1],
            headers={"content-type": "audio/mpeg", "content-range": f"bytes {first}-{last}/{len(AUDIO)}"},
        )

    client, cid = audio_client(
        client_factory, tmp_path, handler,
        audio_url=f"https://{page_host}/page?signature=SIGNED-VALUE",
        audio_allowed_hosts=f"{page_host},{ALLOWED}",
    )
    path = f"/api/v1/conversations/{cid}/audio"
    for first in (0, 7000):
        response = client.get(path, headers={"Range": f"bytes={first}-{first + 9}"})
        assert response.status_code == 206
        assert response.content == AUDIO[first : first + 10]
        assert response.headers["content-range"] == f"bytes {first}-{first + 9}/{len(AUDIO)}"
        assert "SIGNED-VALUE" not in str(response.headers)
    response = client.get(path, headers={"Range": "bytes=999999-"})
    assert response.status_code == 416
    assert response.headers["content-range"] == f"bytes */{len(AUDIO)}"
    assert response.json()["code"] == "validation_error"
    assert sum(host == page_host and path == "/page" for host, path, _ in requested) == 3
    assert client.get(f"/api/v1/conversations/{cid}").json()["audio"]["availability"] == "available"


@pytest.mark.parametrize(
    "html",
    [
        '<script>const src="https://media.example.test/a.mp3"</script>',
        '<audio><source src="https://evil.example/a.mp3"></audio>',
        '<audio src="http://media.example.test/a.mp3"></audio>',
        '<audio src="https://private.example.test/a.mp3"></audio>',
        '<audio src="/a.mp3"><source src="/b.mp3"></audio>',
        '<audio src="/a.mp3" src="/b.mp3"></audio>',
        " " * (MAX_AUDIO_PAGE_BYTES + 1),
    ],
)
def test_unsafe_or_unsupported_audio_page_keeps_transcript(client_factory, tmp_path, html):
    requests = []

    def handler(request):
        requests.append(request.url.path)
        return httpx.Response(200, text=html, headers={"content-type": "text/html"})

    client, cid = audio_client(
        client_factory, tmp_path, handler,
        audio_allowed_hosts=f"{ALLOWED},private.example.test",
        resolver=lambda host: ["127.0.0.1"] if host == "private.example.test" else public_resolver(host),
    )
    assert_unavailable(client.get(f"/api/v1/conversations/{cid}/audio"))
    assert requests == ["/a.mp3"]
    document = client.get(f"/api/v1/conversations/{cid}").json()
    assert len(document["messages"]) == 2
    assert document["audio"]["alignment_status"] == "unverified"


def test_expired_embedded_link_refreshes_once_and_never_loops(client_factory, tmp_path):
    pages = []
    expired = [False]

    def handler(request):
        if request.url.path == "/a.mp3":
            pages.append(len(pages) + 1)
            return httpx.Response(
                200, text=f'<audio src="/media-{pages[-1]}.mp3?signature=SIGNED-VALUE"></audio>',
                headers={"content-type": "text/html"},
            )
        if expired[0] or request.url.path == "/media-1.mp3":
            return httpx.Response(403, text="SIGNED-VALUE expired")
        return httpx.Response(200, content=AUDIO, headers={"content-type": "audio/mpeg"})

    client, cid = audio_client(client_factory, tmp_path, handler)
    assert client.get(f"/api/v1/conversations/{cid}/audio").content == AUDIO
    assert len(pages) == 2
    expired[0] = True
    assert_unavailable(client.get(f"/api/v1/conversations/{cid}/audio"))
    assert len(pages) == 4


def test_invalid_partial_response_is_not_forwarded(client_factory, tmp_path):
    for content_range in ("", "bytes 8-2/100", "bytes 0-9/100"):
        client, cid = audio_client(
            client_factory, tmp_path,
            lambda request: httpx.Response(
                206, content=b"x", headers={"content-type": "audio/mpeg", "content-range": content_range}
            ),
        )
        assert_unavailable(client.get(f"/api/v1/conversations/{cid}/audio", headers={"Range": "bytes=0-9"}))


def test_historical_revision_uses_its_own_source(client_factory, tmp_path):
    seen = []

    def handler(request):
        seen.append(request.url.path)
        return httpx.Response(200, content=b"x", headers={"content-type": "audio/ogg"})

    payloads = [organizer_payload(f"https://{ALLOWED}/first.ogg")]
    changed = organizer_payload(f"https://{ALLOWED}/second.ogg")
    changed["data"]["records"][0]["messages"][0]["text"] = "Изменённый вопрос"
    payloads.append(changed)
    client = client_factory(
        make_settings(
            tmp_path, dataset_url="https://organizer.invalid/d", audio_allowed_hosts=ALLOWED
        ),
        organizer_transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json=payloads.pop(0))
        ),
        audio_transport=httpx.MockTransport(handler),
        host_resolver=public_resolver,
    )
    client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    imported = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    conversation_id = imported.json()["items"][0]["conversation_id"]
    assert client.get(f"/api/v1/conversations/{conversation_id}/audio").status_code == 200
    assert (
        client.get(
            f"/api/v1/conversations/{conversation_id}/audio", params={"revision": 1}
        ).status_code
        == 200
    )
    assert seen == ["/second.ogg", "/first.ogg"]
    assert (
        client.get(
            f"/api/v1/conversations/{conversation_id}/audio", params={"revision": 9}
        ).status_code
        == 404
    )


def assert_unavailable(response):
    assert response.status_code == 503
    assert response.json()["code"] == "audio_unavailable"
    assert "SIGNED-VALUE" not in response.text
    assert ALLOWED not in response.text


def test_no_audio_and_unknown_conversation(client_factory, tmp_path):
    client = client_factory(make_settings(tmp_path))
    from conftest import chat_record, import_records

    conversation_id = import_records(client, chat_record())["items"][0]["conversation_id"]
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))
    assert client.get("/api/v1/conversations/absent/audio").status_code == 404


def test_host_outside_the_allowlist_keeps_text_mode_with_a_limitation(client_factory, tmp_path):
    requested = []

    def handler(request):
        requested.append(request)
        return httpx.Response(200, content=b"x", headers={"content-type": "audio/mpeg"})

    client, conversation_id = audio_client(
        client_factory, tmp_path, handler, audio_url="https://not-allowed.example/a.mp3"
    )
    conversation = client.get(f"/api/v1/conversations/{conversation_id}").json()
    assert conversation["audio"]["access_path"] is None
    assert conversation["audio"]["availability"] == "unknown"
    assert conversation["warnings"]
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))
    assert requested == []


@pytest.mark.parametrize(
    "bad_url",
    [
        "http://media.example.test/a.mp3",
        "file:///etc/passwd",
        "https://user:pw@media.example.test/a.mp3",
        "https://media.example.test:8443/a.mp3",
        "ftp://media.example.test/a.mp3",
    ],
)
def test_unsafe_source_urls_are_never_requested(client_factory, tmp_path, bad_url):
    requested = []

    def handler(request):
        requested.append(request)
        return httpx.Response(200)

    client, conversation_id = audio_client(client_factory, tmp_path, handler, audio_url=bad_url)
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))
    assert requested == []


@pytest.mark.parametrize(
    "address",
    ["127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254", "::1", "fe80::1", "not-an-ip"],
)
def test_allowlisted_host_resolving_to_private_address_is_refused(
    client_factory, tmp_path, address
):
    requested = []

    def handler(request):
        requested.append(request)
        return httpx.Response(200)

    client, conversation_id = audio_client(
        client_factory, tmp_path, handler, resolver=lambda host: [address]
    )
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))
    assert requested == []


def test_failed_name_resolution_is_refused(client_factory, tmp_path):
    def broken(host):
        raise OSError("no such host")

    client, conversation_id = audio_client(
        client_factory, tmp_path, lambda r: httpx.Response(200), resolver=broken
    )
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))


@pytest.mark.parametrize(
    "location",
    [
        "http://media.example.test/plain.mp3",
        "https://evil.example/stolen.mp3",
        "https://169.254.169.254/latest/meta-data",
        "file:///etc/passwd",
    ],
)
def test_unsafe_redirects_are_refused(client_factory, tmp_path, location):
    requested = []

    def handler(request):
        requested.append(str(request.url))
        return httpx.Response(302, headers={"location": location})

    client, conversation_id = audio_client(client_factory, tmp_path, handler)
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))
    assert len(requested) == 1


def test_safe_redirect_is_followed_and_loops_are_bounded(client_factory, tmp_path):
    hops = []

    def handler(request):
        hops.append(request.url.path)
        if request.url.path == "/a.mp3":
            return httpx.Response(302, headers={"location": "/final.mp3"})
        return httpx.Response(200, content=b"ok", headers={"content-type": "audio/mpeg"})

    client, conversation_id = audio_client(client_factory, tmp_path, handler)
    assert client.get(f"/api/v1/conversations/{conversation_id}/audio").content == b"ok"
    assert hops == ["/a.mp3", "/final.mp3"]

    calls = []

    def looping(request):
        calls.append(request.url.path)
        return httpx.Response(302, headers={"location": "/a.mp3"})

    client.app.state.services.audio_transport = httpx.MockTransport(looping)
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))
    assert len(calls) == 4


def test_upstream_failures_never_prove_absence(client_factory, tmp_path):
    outcomes = [
        httpx.Response(403, text="SIGNED-VALUE expired"),
        httpx.Response(
            200, text="<html>SIGNED-VALUE</html>", headers={"content-type": "text/html"}
        ),
        httpx.Response(500),
    ]

    def handler(request):
        return outcomes.pop(0)

    client, conversation_id = audio_client(client_factory, tmp_path, handler)
    for _ in range(3):
        assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))
    conversation = client.get(f"/api/v1/conversations/{conversation_id}").json()
    assert conversation["audio"]["availability"] == "unknown"  # not "unavailable"


def test_transport_error_and_timeout_are_safe(client_factory, tmp_path):
    failures = [httpx.ConnectError("SIGNED-VALUE"), httpx.ReadTimeout("SIGNED-VALUE")]

    def handler(request):
        raise failures.pop(0)

    client, conversation_id = audio_client(client_factory, tmp_path, handler)
    for _ in range(2):
        assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))


def test_size_limit_on_declared_length(client_factory, tmp_path):
    client, conversation_id = audio_client(client_factory, tmp_path, serve, audio_max_bytes=100)
    assert_unavailable(client.get(f"/api/v1/conversations/{conversation_id}/audio"))


def test_size_limit_on_undeclared_length_aborts_the_stream(client_factory, tmp_path):
    def handler(request):
        async def chunks():
            for _ in range(10):
                yield b"x" * 1000

        return httpx.Response(200, content=chunks(), headers={"content-type": "audio/mpeg"})

    client, conversation_id = audio_client(client_factory, tmp_path, handler, audio_max_bytes=2500)
    with pytest.raises(RuntimeError):
        client.get(f"/api/v1/conversations/{conversation_id}/audio")


def test_signed_url_absent_from_all_responses_exports_and_logs(client_factory, tmp_path, caplog):
    client, conversation_id = audio_client(client_factory, tmp_path, serve)
    with caplog.at_level(logging.DEBUG):
        client.get(f"/api/v1/conversations/{conversation_id}/audio")
        client.get(f"/api/v1/conversations/{conversation_id}")
        listed = client.get("/api/v1/conversations")
    assert "SIGNED-VALUE" not in listed.text
    assert "SIGNED-VALUE" not in caplog.text
    from conftest import create_batch, create_checklist, drain

    version = create_checklist(client)
    batch = create_batch(client, [conversation_id], version["version_id"]).json()
    drain(client)
    job = client.get(f"/api/v1/jobs/{batch['jobs'][0]['id']}").json()
    assert "SIGNED-VALUE" not in client.get(f"/api/v1/jobs/{job['id']}").text
    view = client.get(f"/api/v1/evaluations/{job['evaluation_id']}")
    assert "SIGNED-VALUE" not in view.text
    for params in ({}, {"format": "csv"}):
        exported = client.get(f"/api/v1/evaluation-batches/{batch['id']}/export", params=params)
        assert "SIGNED-VALUE" not in exported.text
        assert ALLOWED not in exported.text


def test_rotated_signed_link_updates_privately_without_a_new_revision(client_factory, tmp_path):
    links = [SIGNED, f"https://{ALLOWED}/a.mp3?signature=ROTATED"]
    seen = []

    def handler(request):
        seen.append(request.url.params.get("signature"))
        return httpx.Response(200, content=b"x", headers={"content-type": "audio/mpeg"})

    client = client_factory(
        make_settings(
            tmp_path, dataset_url="https://organizer.invalid/d", audio_allowed_hosts=ALLOWED
        ),
        organizer_transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json=organizer_payload(links.pop(0)))
        ),
        audio_transport=httpx.MockTransport(handler),
        host_resolver=public_resolver,
    )
    client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    second = client.post("/api/v1/imports", json={"source": "organizer_api", "group_id": "g"})
    item = second.json()["items"][0]
    assert item["disposition"] == "unchanged"
    assert item["revision"] == 1
    client.get(f"/api/v1/conversations/{item['conversation_id']}/audio")
    assert seen == ["ROTATED"]
