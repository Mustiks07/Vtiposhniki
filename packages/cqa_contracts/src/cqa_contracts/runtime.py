"""Fail-closed configuration gate shared by foundation and future providers."""

from collections.abc import Mapping
from urllib.parse import urlsplit

from .interfaces import ConfigurationError
from .models import APIError, ErrorCode, EvaluatorProfile

PROVIDER_ENV_KEYS = {
    "gemini": "GEMINI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "xerosharc": "XEROSHARC_API_KEY",
}
XEROSHARC_BASE_URL = "https://xerosharc.site/v1"


def xerosharc_base_url(environment: Mapping[str, str]) -> str:
    value = environment.get("XEROSHARC_BASE_URL", XEROSHARC_BASE_URL).strip().rstrip("/")
    try:
        parsed = urlsplit(value)
        _ = parsed.port  # Validate malformed/non-numeric ports before HTTP client construction.
        valid = bool(
            parsed.scheme == "https"
            and parsed.hostname
            and not parsed.username
            and not parsed.password
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        valid = False
    if not valid:
        raise ConfigurationError(
            APIError(
                code=ErrorCode.CONFIGURATION_ERROR,
                message="Xerosharc requires an HTTPS base URL without credentials or query",
                retryable=False,
                correlation_id="configuration",
            )
        )
    return value


def require_production_configuration(
    profile: EvaluatorProfile, environment: Mapping[str, str]
) -> None:
    if profile.mode != "production":
        raise ConfigurationError(
            APIError(
                code=ErrorCode.CONFIGURATION_ERROR,
                message="Production entrypoint rejects test profiles",
                retryable=False,
                correlation_id="configuration",
            )
        )
    selections = [
        profile.primary,
        *profile.fallbacks,
        *([profile.reviewer] if profile.reviewer else []),
    ]
    if any(not environment.get(PROVIDER_ENV_KEYS[p.provider], "").strip() for p in selections):
        raise ConfigurationError(
            APIError(
                code=ErrorCode.CONFIGURATION_ERROR,
                message="Required provider credential is not configured",
                retryable=False,
                correlation_id="configuration",
            )
        )
    if any(p.provider == "xerosharc" for p in selections):
        xerosharc_base_url(environment)
