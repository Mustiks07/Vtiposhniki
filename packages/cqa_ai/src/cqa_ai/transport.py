"""Provider-neutral transport boundary used by the evaluator.

These are internal execution types, not public DTOs: the shared CallRecord,
TokenUsage and APIError stay the only persisted/wire shapes.
"""

from dataclasses import dataclass, field
from typing import Literal, Protocol

from cqa_contracts.models import TokenUsage

FailureKind = Literal[
    "auth",  # 401/403/invalid key: configuration, never retried
    "configuration",  # unknown model, unsupported mode: never retried
    "bad_request",  # 400 / rejected payload: not retried
    "rate_limited",  # 429: retry within budget, honours Retry-After
    "server",  # 5xx / overloaded: retry within budget
    "network",  # connection/reset/DNS: retry within budget
    "timeout",  # per-call timeout: retry within budget
    "refusal",  # provider/model refused or blocked: no retry, fallback allowed
    "insufficient_quota",  # 402/quota exhausted: not retried
]

RETRYABLE: frozenset[str] = frozenset({"rate_limited", "server", "network", "timeout"})
NO_FALLBACK: frozenset[str] = frozenset({"auth", "configuration"})


class ProviderFailure(Exception):
    """Safe provider failure: never carries a raw provider body, key or URL."""

    def __init__(
        self,
        kind: FailureKind,
        message: str,
        *,
        retry_after: float | None = None,
        usage: TokenUsage | None = None,
        finish_reason: Literal["stop", "length", "refusal", "error", "unknown"] = "error",
        actual_model: str | None = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.safe_message = message
        self.retry_after = retry_after
        self.usage = usage
        self.finish_reason = finish_reason
        self.actual_model = actual_model

    @property
    def retryable(self) -> bool:
        return self.kind in RETRYABLE


@dataclass(frozen=True)
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass(frozen=True)
class ProviderRequest:
    model: str
    messages: tuple[ChatMessage, ...]
    temperature: float
    max_output_tokens: int
    seed: int | None = None
    json_output: bool = True
    timeout_seconds: float = 60.0


@dataclass(frozen=True)
class ProviderResponse:
    content: str
    finish_reason: Literal["stop", "length", "refusal", "error", "unknown"]
    usage: TokenUsage | None
    actual_model: str | None = None
    provider_cost: str | None = None  # provider-reported, informational only


@dataclass(frozen=True)
class Capabilities:
    """Declared, not assumed: strict schema support differs between endpoints."""

    json_object: bool
    json_schema_strict: bool
    seed: bool
    reports_usage: bool
    reports_reasoning_tokens: bool
    notes: tuple[str, ...] = field(default_factory=tuple)


class ProviderTransport(Protocol):
    provider: str
    capabilities: Capabilities

    async def complete(self, request: ProviderRequest) -> ProviderResponse:
        """Return a response or raise ProviderFailure; never log credentials."""
        ...
