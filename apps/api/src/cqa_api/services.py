"""Explicit application wiring. Test and production paths never mix implicitly."""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx
from cqa_contracts.interfaces import ConfigurationError, Evaluator
from cqa_contracts.models import ErrorCode

from .db import Database
from .errors import make_error
from .ports import DomainPort, production_domain, production_evaluator
from .settings import Settings
from .testmode import build_test_domain, build_test_evaluator

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass
class Services:
    settings: Settings
    db: Database
    domain: DomainPort
    evaluator: Evaluator
    clock: Clock = utc_now
    organizer_transport: httpx.BaseTransport | None = None
    audio_transport: httpx.AsyncBaseTransport | None = None
    host_resolver: Callable[[str], list[str]] | None = None
    registry_errors: list[str] = field(default_factory=list)


def _require_consistent_mode(settings: Settings) -> None:
    if settings.mode != settings.evaluator:
        raise ConfigurationError(
            make_error(
                ErrorCode.CONFIGURATION_ERROR,
                "CQA_MODE and CQA_EVALUATOR must both be production or both be test",
            )
        )


def build_services(
    settings: Settings,
    *,
    domain: DomainPort | None = None,
    evaluator: Evaluator | None = None,
    clock: Clock = utc_now,
    organizer_transport: httpx.BaseTransport | None = None,
    audio_transport: httpx.AsyncBaseTransport | None = None,
    host_resolver: Callable[[str], list[str]] | None = None,
) -> Services:
    _require_consistent_mode(settings)
    if settings.mode == "test":
        bound_domain = build_test_domain(domain)
        bound_evaluator = evaluator if evaluator is not None else build_test_evaluator(settings)
    else:
        bound_domain = domain if domain is not None else production_domain()
        bound_evaluator = evaluator if evaluator is not None else production_evaluator()
    return Services(
        settings=settings,
        db=Database(
            settings.database_url,
            busy_timeout_ms=settings.sqlite_busy_timeout_ms,
            synchronous=settings.sqlite_synchronous,
        ),
        domain=bound_domain,
        evaluator=bound_evaluator,
        clock=clock,
        organizer_transport=organizer_transport,
        audio_transport=audio_transport,
        host_resolver=host_resolver,
    )
