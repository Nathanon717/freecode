# src/providers/anthropic-cost.ts - Anthropic Cost Estimates

**Role:** Estimates Anthropic API cost from captured usage metadata and Anthropic model pricing.

## Exports

```typescript
ANTHROPIC_PRICING_URL
ANTHROPIC_USAGE_COST_URL

resetAnthropicSessionCost(): void
addAnthropicSessionCost(estimate): number
getAnthropicSessionCost(): number
formatUsdCeil(usd): string
describeCostEstimate(estimate): string
describeCostEstimateBreakdown(estimate): string | null
modelPricingKey(modelId: string): string
parseAnthropicPricingHtml(html, fetchedAt?): AnthropicPricingTable
getAnthropicPricing(): Promise<AnthropicPricingTable>
estimateAnthropicCost(modelId, usage, pricingTable): CostEstimate
```

## Pricing Source

`getAnthropicPricing()` fetches the Anthropic pricing page once per process and parses model rows into a normalized pricing table. If the fetch or parse fails, it falls back to a bundled table dated `2026-05-19`.

`modelPricingKey()` normalizes versioned model IDs such as `claude-haiku-4-5-20251001` to pricing keys such as `claude-haiku-4-5`.

## Cost Calculation

`estimateAnthropicCost()` requires raw Anthropic usage. When usage or model pricing is unavailable, it returns a `CostEstimate` with `usd: null` and warnings.

When pricing is available, it estimates:

- input tokens
- output tokens
- 5-minute cache writes
- 1-hour cache writes
- cache reads

If `inferenceGeo` is `us`, the estimate applies the 1.1x US inference multiplier.

## Formatting And Session Totals

`formatUsdCeil()` rounds tiny values up to a visible precision. `addAnthropicSessionCost()` accumulates successful estimates in a process-local total, and `resetAnthropicSessionCost()` clears that total when a new session starts or `/clear` runs.
