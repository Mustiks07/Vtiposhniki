"""Tariffs are configuration, never remembered values. Default table is EMPTY.

Without a verified, versioned price for the exact provider/model the cost of a
call is null (unknown) — never zero. Normalized usage semantics used by adapters:
input_tokens = all prompt tokens (cached included), cached_tokens ⊆ input_tokens,
output_tokens = all billed output tokens (reasoning included),
reasoning_tokens ⊆ output_tokens.
"""

from dataclasses import dataclass
from decimal import Context, Decimal, localcontext

from cqa_contracts.models import ProviderSelection, TokenUsage

_MILLION = Decimal(1_000_000)
# Fixed private precision: cost never depends on the caller's decimal context.
_CONTEXT = Context(prec=60)


@dataclass(frozen=True)
class Price:
    price_version: str
    input_per_million: Decimal
    output_per_million: Decimal
    cached_input_per_million: Decimal | None = None
    currency: str = "USD"


class PriceTable:
    def __init__(self, prices: dict[tuple[str, str], Price] | None = None) -> None:
        self._prices = dict(prices or {})

    def get(self, selection: ProviderSelection) -> Price | None:
        return self._prices.get((selection.provider, selection.model))

    def cost(
        self, selection: ProviderSelection, usage: TokenUsage | None
    ) -> tuple[Decimal | None, str | None]:
        price = self.get(selection)
        if price is None or usage is None:
            return None, None if price is None else price.price_version
        if usage.input_tokens is None or usage.output_tokens is None:
            return None, price.price_version
        cached = usage.cached_tokens or 0
        if cached and price.cached_input_per_million is None:
            cached_rate = price.input_per_million
        else:
            cached_rate = price.cached_input_per_million or Decimal(0)
        uncached = max(usage.input_tokens - cached, 0)
        with localcontext(_CONTEXT):
            total = (
                Decimal(uncached) * price.input_per_million
                + Decimal(cached) * cached_rate
                + Decimal(usage.output_tokens) * price.output_per_million
            ) / _MILLION
        return total, price.price_version
