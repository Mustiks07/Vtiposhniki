import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from cqa_ai.providers import (
    DeepSeekTransport,
    GeminiTransport,
    OpenRouterTransport,
    XerosharcTransport,
    transports_from_environment,
)
from cqa_ai.transport import ChatMessage, ProviderFailure, ProviderRequest

KEY = "sk-test-SECRET-should-never-leak"
REQUEST = ProviderRequest(
    model="model-from-profile",
    messages=(ChatMessage("system", "Return JSON."), ChatMessage("user", "{}")),
    temperature=0.0,
    max_output_tokens=512,
    seed=7,
)


def client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def openai_body(content: Any = '{"criteria": []}', finish: str = "stop", **extra: Any) -> Any:
    return {
        "model": "routed-model-2026",
        "choices": [
            {"message": {"role": "assistant", "content": content}, "finish_reason": finish}
        ],
        "usage": {
            "prompt_tokens": 100,
            "completion_tokens": 20,
            "prompt_tokens_details": {"cached_tokens": 10},
            "completion_tokens_details": {"reasoning_tokens": 5},
        },
        **extra,
    }


@pytest.mark.parametrize("cls", [DeepSeekTransport, OpenRouterTransport])
async def test_openai_compatible_success_and_request_shape(cls: Any) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=openai_body())

    async with client(handler) as c:
        response = await cls(KEY, c).complete(REQUEST)
    body = json.loads(seen[0].content)
    assert seen[0].url.path.endswith("/chat/completions")
    assert seen[0].headers["authorization"] == f"Bearer {KEY}"
    assert body["model"] == "model-from-profile"
    assert body["response_format"] == {"type": "json_object"}
    assert body["max_tokens"] == 512
    assert ("seed" in body) == (cls is OpenRouterTransport)
    assert response.content == '{"criteria": []}'
    assert response.finish_reason == "stop"
    assert response.actual_model == "routed-model-2026"
    assert response.usage is not None
    assert (response.usage.input_tokens, response.usage.output_tokens) == (100, 20)
    assert (response.usage.cached_tokens, response.usage.reasoning_tokens) == (10, 5)


async def test_deepseek_blank_content_is_returned_as_blank_not_success_text() -> None:
    async with client(lambda r: httpx.Response(200, json=openai_body(content="  "))) as c:
        response = await DeepSeekTransport(KEY, c).complete(REQUEST)
    assert response.content.strip() == "" and response.finish_reason == "stop"


async def test_deepseek_cache_hit_usage_field() -> None:
    body = openai_body()
    body["usage"] = {"prompt_tokens": 50, "completion_tokens": 5, "prompt_cache_hit_tokens": 40}
    async with client(lambda r: httpx.Response(200, json=body)) as c:
        response = await DeepSeekTransport(KEY, c).complete(REQUEST)
    assert response.usage is not None and response.usage.cached_tokens == 40


async def test_missing_usage_is_unknown_not_zero() -> None:
    body = openai_body()
    del body["usage"]
    async with client(lambda r: httpx.Response(200, json=body)) as c:
        response = await OpenRouterTransport(KEY, c).complete(REQUEST)
    assert response.usage is None


@pytest.mark.parametrize(
    ("status", "kind", "retryable"),
    [
        (401, "auth", False),
        (403, "auth", False),
        (402, "insufficient_quota", False),
        (404, "configuration", False),
        (400, "bad_request", False),
        (429, "rate_limited", True),
        (500, "server", True),
        (503, "server", True),
    ],
)
async def test_status_mapping_is_safe(status: int, kind: str, retryable: bool) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status,
            headers={"retry-after": "3"},
            json={"error": {"message": f"echo {KEY} secret body"}},
        )

    for cls in (DeepSeekTransport, OpenRouterTransport, GeminiTransport):
        async with client(handler) as c:
            with pytest.raises(ProviderFailure) as info:
                await cls(KEY, c).complete(REQUEST)
        assert info.value.kind == kind
        assert info.value.retryable is retryable
        assert KEY not in str(info.value) and "secret body" not in info.value.safe_message
        assert info.value.retry_after == 3


@pytest.mark.parametrize(
    ("finish", "expected"),
    [("length", "length"), ("weird", "unknown")],
)
async def test_finish_reasons(finish: str, expected: str) -> None:
    async with client(lambda r: httpx.Response(200, json=openai_body(finish=finish))) as c:
        response = await DeepSeekTransport(KEY, c).complete(REQUEST)
    assert response.finish_reason == expected


async def test_refusal_and_content_filter_raise_refusal() -> None:
    refusal = openai_body()
    refusal["choices"][0]["message"]["refusal"] = "cannot help"
    for body in (refusal, openai_body(finish="content_filter")):
        async with client(lambda r, b=body: httpx.Response(200, json=b)) as c:
            with pytest.raises(ProviderFailure) as info:
                await OpenRouterTransport(KEY, c).complete(REQUEST)
        assert info.value.kind == "refusal"


async def test_openrouter_in_body_error_and_floating_alias() -> None:
    body = {"error": {"code": 502, "message": "upstream"}}
    async with client(lambda r: httpx.Response(200, json=body)) as c:
        with pytest.raises(ProviderFailure) as info:
            await OpenRouterTransport(KEY, c).complete(REQUEST)
    assert info.value.kind == "server"
    floating = ProviderRequest(**{**REQUEST.__dict__, "model": "openrouter/free"})
    async with client(lambda r: httpx.Response(200, json=openai_body())) as c:
        with pytest.raises(ProviderFailure) as info:
            await OpenRouterTransport(KEY, c).complete(floating)
    assert info.value.kind == "configuration"


async def test_network_and_timeout_errors() -> None:
    def boom(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("dns")

    def slow(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    for handler, kind in ((boom, "network"), (slow, "timeout")):
        async with client(handler) as c:
            with pytest.raises(ProviderFailure) as info:
                await DeepSeekTransport(KEY, c).complete(REQUEST)
        assert info.value.kind == kind and info.value.retryable


async def test_non_json_envelope_is_server_failure() -> None:
    async with client(lambda r: httpx.Response(200, text="<html>")) as c:
        with pytest.raises(ProviderFailure) as info:
            await GeminiTransport(KEY, c).complete(REQUEST)
    assert info.value.kind == "server"


def gemini_body(finish: str = "STOP", **extra: Any) -> Any:
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "hidden reasoning", "thought": True},
                        {"text": '{"criteria": '},
                        {"text": "[]}"},
                    ]
                },
                "finishReason": finish,
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 300,
            "candidatesTokenCount": 40,
            "thoughtsTokenCount": 60,
            "cachedContentTokenCount": 100,
        },
        "modelVersion": "gemini-version-from-response",
        **extra,
    }


async def test_gemini_success_shape_and_usage() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=gemini_body())

    async with client(handler) as c:
        response = await GeminiTransport(KEY, c).complete(REQUEST)
    request = seen[0]
    assert request.url.path.endswith("/models/model-from-profile:generateContent")
    assert request.headers["x-goog-api-key"] == KEY
    assert KEY not in str(request.url)
    body = json.loads(request.content)
    assert body["systemInstruction"]["parts"][0]["text"] == "Return JSON."
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert body["generationConfig"]["maxOutputTokens"] == 512
    assert response.content == '{"criteria": []}'  # thought part excluded
    assert response.usage is not None
    assert response.usage.output_tokens == 100 and response.usage.reasoning_tokens == 60
    assert response.usage.cached_tokens == 100
    assert response.actual_model == "gemini-version-from-response"


@pytest.mark.parametrize("finish", ["SAFETY", "RECITATION", "PROHIBITED_CONTENT"])
async def test_gemini_safety_is_refusal(finish: str) -> None:
    async with client(lambda r: httpx.Response(200, json=gemini_body(finish))) as c:
        with pytest.raises(ProviderFailure) as info:
            await GeminiTransport(KEY, c).complete(REQUEST)
    assert info.value.kind == "refusal"
    assert info.value.usage is not None


async def test_gemini_blocked_prompt_and_truncation() -> None:
    blocked = {"promptFeedback": {"blockReason": "SAFETY"}}
    async with client(lambda r: httpx.Response(200, json=blocked)) as c:
        with pytest.raises(ProviderFailure) as info:
            await GeminiTransport(KEY, c).complete(REQUEST)
    assert info.value.kind == "refusal"
    async with client(lambda r: httpx.Response(200, json=gemini_body("MAX_TOKENS"))) as c:
        response = await GeminiTransport(KEY, c).complete(REQUEST)
    assert response.finish_reason == "length"
    async with client(lambda r: httpx.Response(200, json={"candidates": []})) as c:
        response = await GeminiTransport(KEY, c).complete(REQUEST)
    assert response.content == "" and response.usage is None


async def test_transports_from_environment_builds_only_used_providers() -> None:
    from _cqa_ai_helpers import profile

    prof = profile().model_copy(
        update={
            "mode": "production",
            "primary": profile().primary.model_copy(update={"provider": "deepseek"}),
            "fallbacks": [profile().primary.model_copy(update={"provider": "gemini"})],
        }
    )
    async with httpx.AsyncClient() as c:
        built = transports_from_environment(
            prof, {"DEEPSEEK_API_KEY": "x", "GEMINI_API_KEY": "y"}, c
        )
    assert sorted(built) == ["deepseek", "gemini"]


async def test_xerosharc_routes_credential_and_preserves_reported_model() -> None:
    from _cqa_ai_helpers import profile
    from cqa_contracts.interfaces import ConfigurationError
    from cqa_contracts.runtime import require_production_configuration

    prof = profile().model_copy(
        update={
            "mode": "production",
            "primary": profile().primary.model_copy(
                update={
                    "provider": "xerosharc",
                    "model": "requested-model",
                    "configuration_ref": "XEROSHARC_API_KEY",
                }
            ),
            "reviewer": None,
            "fallbacks": [],
        }
    )
    with pytest.raises(ConfigurationError):
        require_production_configuration(prof, {"OPENROUTER_API_KEY": KEY})
    environment = {"XEROSHARC_API_KEY": KEY, "XEROSHARC_BASE_URL": "https://proxy.example/v1"}
    require_production_configuration(prof, environment)
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=openai_body(model="gateway-reported-model"))

    async with client(handler) as c:
        built = transports_from_environment(prof, environment, c)
        assert list(built) == ["xerosharc"]
        assert isinstance(built["xerosharc"], XerosharcTransport)
        response = await built["xerosharc"].complete(REQUEST)
    assert str(seen[0].url) == "https://proxy.example/v1/chat/completions"
    assert seen[0].headers["Authorization"] == f"Bearer {KEY}"
    assert "X-Title" not in seen[0].headers
    assert response.actual_model == "gateway-reported-model"
    assert response.usage and response.usage.input_tokens == 100
    body = json.loads(seen[0].content)
    assert body["response_format"] == {"type": "json_object"}
    assert "seed" not in body


@pytest.mark.parametrize(
    "base",
    [
        "http://proxy.example/v1",
        "https://key@proxy.example/v1",
        "https://proxy.example/v1?key=secret",
        "",
        "https://[broken",
        "https://proxy.example:invalid/v1",
    ],
)
def test_xerosharc_rejects_unsafe_endpoint_without_echoing_it(base) -> None:
    from cqa_contracts.interfaces import ConfigurationError
    from cqa_contracts.runtime import xerosharc_base_url

    with pytest.raises(ConfigurationError) as error:
        xerosharc_base_url({"XEROSHARC_BASE_URL": base})
    assert "secret" not in str(error.value)
