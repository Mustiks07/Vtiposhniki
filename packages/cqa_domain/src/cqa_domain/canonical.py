"""Canonical JSON and SHA-256 — the single runtime implementation (docs/CONTRACTS.md).

Rules: UTF-8 JSON, ensure_ascii=False, sorted object keys, separators (',', ':'),
no NaN/Infinity. Decimals become fixed notation without insignificant trailing
zeros ("0" for zero). Text and original timestamps are never normalized or trimmed.
Datetimes/dates/enums use the same JSON representation as the shared DTOs.
"""

import hashlib
import json
import math
from decimal import Decimal
from typing import Any

from pydantic import BaseModel
from pydantic_core import to_jsonable_python

JSONValue = None | bool | int | float | str | list["JSONValue"] | dict[str, "JSONValue"]


def canonical_decimal(value: Decimal) -> str:
    """Exact fixed-point text, independent of any decimal context.

    Works on the digit tuple: no normalize()/quantize(), so no rounding to the
    caller's precision and no exponent notation. Zero (including -0) is "0".
    """
    if not value.is_finite():
        raise ValueError("Canonical decimals must be finite")
    if value.is_zero():
        return "0"
    sign, digit_tuple, exponent = value.as_tuple()
    assert isinstance(exponent, int)
    digits = "".join(str(d) for d in digit_tuple)
    while exponent < 0 and digits.endswith("0"):
        digits = digits[:-1]
        exponent += 1
    if exponent >= 0:
        text = digits + "0" * exponent
    else:
        point = len(digits) + exponent
        text = f"{digits[:point]}.{digits[point:]}" if point > 0 else f"0.{'0' * -point}{digits}"
    text = text.lstrip("0") or "0"
    if text.startswith("."):
        text = "0" + text
    return f"-{text}" if sign else text


def _jsonable(value: Any) -> JSONValue:
    if isinstance(value, BaseModel):
        # Walk declared fields directly: the shared DecimalString serializer would
        # otherwise pre-format decimals (keeping "40.000") before canonicalization.
        return {name: _jsonable(getattr(value, name)) for name in type(value).model_fields}
    if isinstance(value, Decimal):
        return canonical_decimal(value)
    if isinstance(value, bool) or value is None or isinstance(value, (int, str)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Canonical JSON forbids non-finite numbers")
        return value
    if isinstance(value, dict):
        result: dict[str, JSONValue] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("Canonical JSON object keys must be strings")
            result[key] = _jsonable(item)
        return result
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    converted = to_jsonable_python(value)
    if isinstance(converted, (str, int, float, bool)) or converted is None:
        return _jsonable(converted)
    raise TypeError(f"Unsupported canonical value type: {type(value).__name__}")


def canonical_json(value: Any) -> str:
    """Return canonical JSON text for a DTO or plain JSON-like value."""
    return json.dumps(
        _jsonable(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical_hash(value: Any) -> str:
    return sha256_hex(canonical_json(value))
