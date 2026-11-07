"""HTTP adapters for Gemini, DeepSeek and OpenRouter behind ProviderTransport.

- Model IDs come only from the evaluator profile; nothing here picks a model.
- Credentials are passed in headers only; they never appear in errors, records
  or logs. Raw provider bodies are never echoed into safe errors.
- Endpoint shapes follow the providers' public HTTP APIs as understood at
  implementation time and are covered offline by httpx.MockTransport tests.
  They MUST be re-verified (IDs, quotas, tariffs, JSON-mode support) before a
  real run; no live call was made from this package's test suite.
"""

import json
from collections.abc import Callable, Mapping
from typing import Any, Literal
from urllib.parse import quote

import httpx
from cqa_contracts.models import EvaluatorProfile, TokenUsage
from cqa_contracts.runtime import PROVIDER_ENV_KEYS, XEROSHARC_BASE_URL, xerosharc_base_url

from .transport import (
    Capabilities,
    FailureKind,
    ProviderFailure,
    ProviderRequest,
    ProviderResponse,
    ProviderTransport,
)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
FinishReason = Literal["stop", "length", "refusal", "error", "unknown"]


def _status_failure(response: httpx.Response) -> ProviderFailure:
    status = response.status_code
    kind: FailureKind
    if status in (401, 403):
        kind, message = "auth", "Provider rejected the configured credential"
    elif status == 402:
        kind, message = "insufficient_quota", "Provider account has insufficient balance"
    elif status == 404:
        kind, message = "configuration", "Provider does not know the configured model"
    elif status == 408:
        kind, message = "timeout", "Provider reported a request timeout"
    elif status == 429:
        kind, message = "rate_limited", "Provider rate limit reached"
    elif status >= 500:
        kind, message = "server", "Provider is temporarily unavailable"
    else:
        kind, message = "bad_request", "Provider rejected the request"
    return ProviderFailure(kind, message, retry_after=_retry_after(response))


def _retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("retry-after")
    if value is None:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return None  # HTTP-date form is not trusted for scheduling here
    return seconds if seconds >= 0 else None


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else None


async def _post(
    client: httpx.AsyncClient,
    url: str,
    body: dict[str, Any],
    headers: dict[str, str],
    timeout: float,
) -> dict[str, Any]:
    try:
        response = await client.post(url, json=body, headers=headers, timeout=timeout)
    except httpx.TimeoutException:
        raise ProviderFailure("timeout", "Provider call timed out") from None
    except httpx.TransportError:
        raise ProviderFailure("network", "Provider could not be reached") from None
    if response.status_code != 200:
        raise _status_failure(response)
    try:
        data = response.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ProviderFailure("server", "Provider returned a non-JSON envelope") from None
    if not isinstance(data, dict):
        raise ProviderFailure("server", "Provider returned an unexpected envelope")
    return data


class GeminiTransport:
    provider = "gemini"
    capabilities = Capabilities(
        json_object=True,  # responseMimeType=application/json
        json_schema_strict=False,  # responseSchema is a subset; not relied upon
        seed=True,
        reports_usage=True,
        reports_reasoning_tokens=True,
        notes=("thought parts are excluded from content", "SAFETY/RECITATION -> refusal"),
    )

    def __init__(
        self, api_key: str, client: httpx.AsyncClient, base_url: str = GEMINI_BASE_URL
    ) -> None:
        self._key = api_key
        self._client = client
        self._base = base_url.rstrip("/")

    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        system = "\n\n".join(m.content for m in request.messages if m.role == "system")
        contents = [
            {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
            for m in request.messages
            if m.role != "system"
        ]
        config: dict[str, Any] = {
            "temperature": request.temperature,
            "maxOutputTokens": request.max_output_tokens,
        }
        if request.json_output:
            config["responseMimeType"] = "application/json"
        if request.seed is not None:
            config["seed"] = request.seed
        body: dict[str, Any] = {"contents": contents, "generationConfig": config}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        model = request.model.removeprefix("models/")
        url = f"{self._base}/models/{quote(model, safe='.-_')}:generateContent"
        data = await _post(
            self._client, url, body, {"x-goog-api-key": self._key}, request.timeout_seconds
        )
        meta = data.get("usageMetadata") if isinstance(data.get("usageMetadata"), dict) else {}
        assert isinstance(meta, dict)
        candidates_tokens = _int(meta.get("candidatesTokenCount"))
        thoughts = _int(meta.get("thoughtsTokenCount"))
        output = None if candidates_tokens is None else candidates_tokens + (thoughts or 0)
        usage = (
            TokenUsage(
                input_tokens=_int(meta.get("promptTokenCount")),
                output_tokens=output,
                reasoning_tokens=thoughts,
                cached_tokens=_int(meta.get("cachedContentTokenCount")),
            )
            if meta
            else None
        )
        actual = data.get("modelVersion") if isinstance(data.get("modelVersion"), str) else None
        feedback = data.get("promptFeedback")
        if isinstance(feedback, dict) and feedback.get("blockReason"):
            raise ProviderFailure(
                "refusal",
                "Provider blocked the prompt",
                usage=usage,
                finish_reason="refusal",
                actual_model=actual,
            )
        candidates = data.get("candidates")
        if (
            not isinstance(candidates, list)
            or not candidates
            or not isinstance(candidates[0], dict)
        ):
            return ProviderResponse("", "unknown", usage, actual)
        candidate = candidates[0]
        reason = candidate.get("finishReason")
        finish: FinishReason
        if reason == "STOP":
            finish = "stop"
        elif reason == "MAX_TOKENS":
            finish = "length"
        elif reason in (
            "SAFETY",
            "RECITATION",
            "BLOCKLIST",
            "PROHIBITED_CONTENT",
            "SPII",
            "IMAGE_SAFETY",
        ):
            raise ProviderFailure(
                "refusal",
                "Provider refused to answer",
                usage=usage,
                finish_reason="refusal",
                actual_model=actual,
            )
        else:
            finish = "unknown"
        content = candidate.get("content")
        parts = content.get("parts") if isinstance(content, dict) else None
        text = "".join(
            p["text"]
            for p in (parts or [])
            if isinstance(p, dict) and isinstance(p.get("text"), str) and not p.get("thought")
        )
        return ProviderResponse(text, finish, usage, actual)


class OpenAICompatibleTransport:
    """Chat-completions dialect; response model identity is never inferred."""

    provider = "openai-compatible"
    capabilities = Capabilities(
        json_object=True,
        json_schema_strict=False,
        seed=False,
        reports_usage=True,
        reports_reasoning_tokens=False,
    )

    def __init__(self, api_key: str, client: httpx.AsyncClient, base_url: str) -> None:
        self._key = api_key
        self._client = client
        self._base = base_url.rstrip("/")

    def _body(self, request: ProviderRequest) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": request.model,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_output_tokens,
            "stream": False,
        }
        if request.json_output:
            body["response_format"] = {"type": "json_object"}
        if request.seed is not None and self.capabilities.seed:
            body["seed"] = request.seed
        return body

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._key}"}

    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        data = await _post(
            self._client,
            f"{self._base}/chat/completions",
            self._body(request),
            self._headers(),
            request.timeout_seconds,
        )
        raw_usage = data.get("usage") if isinstance(data.get("usage"), dict) else None
        usage = self._usage(raw_usage) if raw_usage else None
        actual = data.get("model") if isinstance(data.get("model"), str) else None
        error = data.get("error")
        if isinstance(error, dict):
            code = error.get("code")
            if code in (401, 403):
                raise ProviderFailure("auth", "Provider rejected the configured credential")
            if code == 429:
                raise ProviderFailure("rate_limited", "Provider rate limit reached")
            raise ProviderFailure(
                "server", "Provider reported an upstream error", usage=usage, actual_model=actual
            )
        choices = data.get("choices")
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            return ProviderResponse("", "unknown", usage, actual)
        choice = choices[0]
        message = choice.get("message") if isinstance(choice.get("message"), dict) else {}
        assert isinstance(message, dict)
        if message.get("refusal"):
            raise ProviderFailure(
                "refusal",
                "Model refused to answer",
                usage=usage,
                finish_reason="refusal",
                actual_model=actual,
            )
        reason = choice.get("finish_reason")
        finish: FinishReason
        if reason == "stop":
            finish = "stop"
        elif reason == "length":
            finish = "length"
        elif reason == "content_filter":
            raise ProviderFailure(
                "refusal",
                "Provider content filter blocked the answer",
                usage=usage,
                finish_reason="refusal",
                actual_model=actual,
            )
        elif reason in ("error", "insufficient_system_resource"):
            raise ProviderFailure(
                "server", "Provider could not finish the answer", usage=usage, actual_model=actual
            )
        else:
            finish = "unknown"
        content = message.get("content")
        # DeepSeek json_object may return blank content even with finish_reason=stop:
        # the evaluator treats that as invalid output, never as success.
        text = content if isinstance(content, str) else ""
        cost = raw_usage.get("cost") if raw_usage else None
        provider_cost = str(cost) if isinstance(cost, (int, float, str)) else None
        return ProviderResponse(text, finish, usage, actual, provider_cost)

    @staticmethod
    def _usage(raw: dict[str, Any]) -> TokenUsage:
        prompt_details = raw.get("prompt_tokens_details")
        completion_details = raw.get("completion_tokens_details")
        cached = _int(raw.get("prompt_cache_hit_tokens"))  # DeepSeek
        if cached is None and isinstance(prompt_details, dict):
            cached = _int(prompt_details.get("cached_tokens"))
        reasoning = (
            _int(completion_details.get("reasoning_tokens"))
            if isinstance(completion_details, dict)
            else None
        )
        return TokenUsage(
            input_tokens=_int(raw.get("prompt_tokens")),
            output_tokens=_int(raw.get("completion_tokens")),  # includes reasoning
            reasoning_tokens=reasoning,
            cached_tokens=cached,
        )


class DeepSeekTransport(OpenAICompatibleTransport):
    provider = "deepseek"
    capabilities = Capabilities(
        json_object=True,  # requires the word "json" in the prompt; may return blank content
        json_schema_strict=False,
        seed=False,
        reports_usage=True,
        reports_reasoning_tokens=True,
        notes=("json_object can return empty content; finish_reason=stop is not success",),
    )

    def __init__(
        self, api_key: str, client: httpx.AsyncClient, base_url: str = DEEPSEEK_BASE_URL
    ) -> None:
        super().__init__(api_key, client, base_url)


class OpenRouterTransport(OpenAICompatibleTransport):
    provider = "openrouter"
    capabilities = Capabilities(
        json_object=True,  # support depends on the routed endpoint; not guaranteed
        json_schema_strict=False,
        seed=True,
        reports_usage=True,
        reports_reasoning_tokens=True,
        notes=(
            "pin an exact model id; never openrouter/free as a reproducible evaluator",
            "actual routed model is recorded from the response",
        ),
    )

    def __init__(
        self, api_key: str, client: httpx.AsyncClient, base_url: str = OPENROUTER_BASE_URL
    ) -> None:
        super().__init__(api_key, client, base_url)

    def _headers(self) -> dict[str, str]:
        return {**super()._headers(), "X-Title": "CQA"}

    def _body(self, request: ProviderRequest) -> dict[str, Any]:
        if request.model in ("openrouter/free", "openrouter/auto"):
            raise ProviderFailure(
                "configuration", "A floating router alias is not a reproducible evaluator"
            )
        return super()._body(request)


class XerosharcTransport(OpenAICompatibleTransport):
    provider = "xerosharc"
    capabilities = Capabilities(
        json_object=True,
        json_schema_strict=False,
        seed=False,
        reports_usage=True,
        reports_reasoning_tokens=True,
        notes=("third-party gateway; reported model may differ from requested model",),
    )

    def __init__(
        self, api_key: str, client: httpx.AsyncClient, base_url: str = XEROSHARC_BASE_URL
    ) -> None:
        super().__init__(api_key, client, base_url)


def transports_from_environment(
    profile: EvaluatorProfile, environment: Mapping[str, str], client: httpx.AsyncClient
) -> dict[str, ProviderTransport]:
    """Build only the transports the profile uses; keys come from the environment."""
    builders: dict[str, Callable[[str, httpx.AsyncClient], ProviderTransport]] = {
        "gemini": GeminiTransport,
        "deepseek": DeepSeekTransport,
        "openrouter": OpenRouterTransport,
        "xerosharc": lambda key, client: XerosharcTransport(
            key, client, xerosharc_base_url(environment)
        ),
    }
    used = {
        s.provider
        for s in [
            profile.primary,
            *profile.fallbacks,
            *([profile.reviewer] if profile.reviewer else []),
        ]
    }
    transports: dict[str, ProviderTransport] = {}
    for provider in sorted(used):
        builder = builders.get(provider)
        if builder is None:
            continue
        key = environment.get(PROVIDER_ENV_KEYS[provider], "").strip()
        transports[provider] = builder(key, client)
    return transports
