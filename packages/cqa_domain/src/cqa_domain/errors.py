"""Safe construction of DomainValidationError.

Messages are fixed texts and details carry only structural paths/indexes, never
user-supplied values (docs/CONTRACTS.md: errors never echo request input).
"""

from collections.abc import Iterable
from typing import Literal

from cqa_contracts.interfaces import DomainValidationError
from cqa_contracts.models import APIError, ErrorCode, ErrorDetail

Reason = Literal[
    "invalid", "missing", "duplicate", "conflicting_duplicate", "limit_exceeded", "unsupported"
]


class Problems:
    """Accumulates validation problems so a caller sees all of them at once."""

    def __init__(self) -> None:
        self.details: list[ErrorDetail] = []

    def add(self, field: str, reason: Reason = "invalid", index: int | None = None) -> None:
        self.details.append(ErrorDetail(index=index, field=field, reason=reason))

    def extend(self, details: Iterable[ErrorDetail]) -> None:
        self.details.extend(details)

    def __bool__(self) -> bool:
        return bool(self.details)

    def raise_if_any(self, message: str, correlation_id: str = "domain-validation") -> None:
        if self.details:
            raise domain_error(message, self.details, correlation_id)


def domain_error(
    message: str, details: list[ErrorDetail], correlation_id: str = "domain-validation"
) -> DomainValidationError:
    return DomainValidationError(
        APIError(
            code=ErrorCode.VALIDATION_ERROR,
            message=message,
            details=details,
            retryable=False,
            correlation_id=correlation_id,
        )
    )
