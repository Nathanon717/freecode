# src/providers/anthropic-cost.ts - Anthropic Cost Estimates

**Role:** Estimates Anthropic API cost from captured usage metadata and verified pricing rates. The primary production path uses `estimateAnthropicCostVerified` (fed by `pricing-verifier.ts`); `estimateAnthropicCost` with an `AnthropicPricingTable` is retained for tests and the legacy HTML-scraper path.

## Exports

```typescript
ANTHROPIC_PRICING_URL
ANTHROPIC_USAGE_COST_URL

resetAnthropicSessionCost(): void
addAnthropicSessionCost(estimate): number
getAnthropicSessionCost(): number
formatUsdCeil(usd): string
describeCostEstimate(estimate, opts?: { colored?: boolean }): string
describeCostEstimateBreakdown(estimate): string | null
modelPricingKey(modelId: string): string
parseAnthropicPricingHtml(html, fetchedAt?): AnthropicPricingTable
getAnthropicPricing(): Promise<AnthropicPricingTable>
estimateAnthropicCost(modelId, usage, pricingTable): CostEstimate
estimateAnthropicCostVerified(modelId, usage, rates: VerifiedRates): CostEstimate
```

## Pricing Source

The production path calls `estimateAnthropicCostVerified` with a `VerifiedRates` object from `pricing-verifier.ts`. Cache tiers (5m write, 1h write, cache read) are derived from the verified input price using standard Anthropic multipliers (1.25×, 2×, 0.1×).

`getAnthropicPricing()` (legacy) fetches the Anthropic pricing HTML page and falls back to a bundled table if parsing fails.

## Cost Calculation

`estimateAnthropicCostVerified()` short-circuits to `usd: null` with `confidence: 'disagree'` when sources disagree. Otherwise it delegates to `estimateAnthropicCost` and attaches the confidence level.

`estimateAnthropicCost()` requires raw Anthropic usage and estimates input, output, 5m/1h cache writes, and cache reads. US inference (`inferenceGeo: 'us'`) applies a 1.1× multiplier.

## Formatting, Colors, And Session Totals

`describeCostEstimate(estimate, { colored: true })` returns chalk-colored text based on `confidence`:
- `agreed` → green price
- `litellm-only` / `openrouter-only` → yellow price + source label
- `disagree` → red "sources disagree"

`formatUsdCeil()` rounds tiny values up to a visible precision. `addAnthropicSessionCost()` accumulates estimates in a process-local total; `resetAnthropicSessionCost()` clears it on `/clear` or new session.
