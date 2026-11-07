"""The single API error shape. Messages are fixed text; input is never echoed."""

import logging
from collections.abc import Iterable
from typing import Any
from uuid import uuid4

from cqa_contracts.interfaces import ContractError
from cqa_contracts.models import APIError, ErrorCode, ErrorDetail
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException

logger = logging.getLogger("cqa_api")

STATUS_BY_CODE: dict[ErrorCode, int] = {
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.REVISION_CONFLICT: 409,
    ErrorCode.IDEMPOTENCY_CONFLICT: 409,
    ErrorCode.OPEN_APPEAL_EXISTS: 409,
    ErrorCode.INVALID_STATE: 409,
    ErrorCode.PAYLOAD_TOO_LARGE: 413,
    ErrorCode.CONFIGURATION_ERROR: 503,
    ErrorCode.PROVIDER_ERROR: 503,
    ErrorCode.BUDGET_EXCEEDED: 409,
    ErrorCode.TIMEOUT: 504,
    ErrorCode.CANCELLED: 409,
    ErrorCode.LEASE_LOST: 409,
    ErrorCode.PERSISTENCE_ERROR: 503,
    ErrorCode.AUDIO_UNAVAILABLE: 503,
    ErrorCode.NOT_IMPLEMENTED: 501,
    ErrorCode.INTERNAL_ERROR: 500,
}


def make_error(
    code: ErrorCode,
    message: str,
    *,
    retryable: bool = False,
    details: Iterable[ErrorDetail] = (),
) -> APIError:
    return APIError(
        code=code,
        message=message,
        details=list(details),
        retryable=retryable,
        correlation_id=str(uuid4()),
    )


class ApiFailure(ContractError):
    """A request failure with an explicit HTTP status when the code's default differs."""

    def __init__(self, error: APIError, status: int | None = None) -> None:
        super().__init__(error)
        self.status = status if status is not None else STATUS_BY_CODE[error.code]


def not_found(what: str = "Resource") -> ApiFailure:
    return ApiFailure(make_error(ErrorCode.NOT_FOUND, f"{what} not found"))


def validation_failure(message: str, details: Iterable[ErrorDetail] = ()) -> ApiFailure:
    return ApiFailure(make_error(ErrorCode.VALIDATION_ERROR, message, details=details))


def not_implemented() -> ApiFailure:
    return ApiFailure(make_error(ErrorCode.NOT_IMPLEMENTED, "Operation is not implemented yet"))


def too_large(message: str = "Payload exceeds the configured limit") -> ApiFailure:
    return ApiFailure(
        make_error(
            ErrorCode.PAYLOAD_TOO_LARGE,
            message,
            details=[ErrorDetail(reason="limit_exceeded")],
        )
    )


def _reason(error_type: str) -> Any:
    if error_type == "extra_forbidden":
        return "unsupported"
    if error_type == "missing":
        return "missing"
    if error_type == "too_long":
        return "limit_exceeded"
    return "invalid"


def _safe_detail(error: Any) -> ErrorDetail:
    # An unknown key is client input: report where it was found, never its name.
    loc = list(error["loc"])
    if error["type"] == "extra_forbidden" and loc:
        loc = loc[:-1]
    index = None
    for position, part in enumerate(loc[:-1]):
        if part == "records" and isinstance(loc[position + 1], int):
            index = loc[position + 1]
            break
    return ErrorDetail(
        index=index,
        field=".".join(str(part) for part in loc),
        reason=_reason(error["type"]),
    )


def request_validation_failure(exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    oversized = any(e["type"] == "too_long" and e["loc"][-1] == "records" for e in errors)
    error = make_error(
        ErrorCode.PAYLOAD_TOO_LARGE if oversized else ErrorCode.VALIDATION_ERROR,
        "Payload exceeds the configured limit" if oversized else "Invalid request",
        details=[_safe_detail(e) for e in errors],
    )
    return JSONResponse(error.model_dump(mode="json"), status_code=STATUS_BY_CODE[error.code])


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception) -> JSONResponse:
        error = make_error(ErrorCode.INTERNAL_ERROR, "Internal server error")
        # Type only: exception text may carry private input.
        logger.error(
            "Unhandled %s correlation_id=%s", type(exc).__name__, error.correlation_id
        )
        return JSONResponse(error.model_dump(mode="json"), status_code=500)

    @app.exception_handler(ContractError)
    async def contract(request: Request, exc: ContractError) -> JSONResponse:
        status = exc.status if isinstance(exc, ApiFailure) else STATUS_BY_CODE[exc.error.code]
        return JSONResponse(exc.error.model_dump(mode="json"), status_code=status)

    @app.exception_handler(NotImplementedError)
    async def domain_missing(request: Request, exc: NotImplementedError) -> JSONResponse:
        error = make_error(
            ErrorCode.CONFIGURATION_ERROR, "A required domain or AI module is not available"
        )
        return JSONResponse(error.model_dump(mode="json"), status_code=503)

    @app.exception_handler(OperationalError)
    async def database_busy(request: Request, exc: OperationalError) -> JSONResponse:
        error = make_error(
            ErrorCode.PERSISTENCE_ERROR, "Storage is temporarily unavailable", retryable=True
        )
        logger.error("Database failure correlation_id=%s", error.correlation_id)
        return JSONResponse(error.model_dump(mode="json"), status_code=503)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
        return request_validation_failure(exc)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        error = make_error(
            ErrorCode.NOT_FOUND if exc.status_code == 404 else ErrorCode.INVALID_STATE,
            "Resource not found" if exc.status_code == 404 else "Request rejected",
        )
        return JSONResponse(error.model_dump(mode="json"), status_code=exc.status_code)
