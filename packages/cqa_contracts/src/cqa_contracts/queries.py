"""Cross-parameter wire validation shared by contract and application routes."""

from uuid import uuid4

from pydantic import ValidationError

from .http_models import ConversationFlagQuery, FlagScope, FlagStatus
from .interfaces import ContractError
from .models import APIError, ErrorCode, ErrorDetail


def conversation_flag_query(
    checklist_version_id: str | None,
    flag_criterion_id: str | None,
    flag_status: FlagStatus | None,
    flag_scope: FlagScope,
) -> ConversationFlagQuery:
    try:
        return ConversationFlagQuery(
            checklist_version_id=checklist_version_id,
            flag_criterion_id=flag_criterion_id,
            flag_status=flag_status,
            flag_scope=flag_scope,
        )
    except ValidationError as exc:
        raise ContractError(
            APIError(
                code=ErrorCode.VALIDATION_ERROR,
                message="Flag selection requires an explicit checklist version and criterion",
                details=[ErrorDetail(field="query", reason="invalid")],
                retryable=False,
                correlation_id=str(uuid4()),
            )
        ) from exc
