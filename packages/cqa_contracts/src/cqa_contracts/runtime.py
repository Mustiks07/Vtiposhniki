"""Fail-closed configuration gate shared by foundation and future providers."""

from collections.abc import Mapping

from .interfaces import ConfigurationError
from .models import APIError, ErrorCode, EvaluatorProfile


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
    keys = {
        "gemini": "GEMINI_API_KEY",
        "deepseek": "DEEPSEEK_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    selections = [
        profile.primary,
        *profile.fallbacks,
        *([profile.reviewer] if profile.reviewer else []),
    ]
    if any(not environment.get(keys[p.provider], "").strip() for p in selections):
        raise ConfigurationError(
            APIError(
                code=ErrorCode.CONFIGURATION_ERROR,
                message="Required provider credential is not configured",
                retryable=False,
                correlation_id="configuration",
            )
        )
