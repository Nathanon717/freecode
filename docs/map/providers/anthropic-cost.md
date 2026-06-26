# src/providers/anthropic-cost.ts - Anthropic Cost Estimates

**Role:** Estimates Anthropic API cost from captured usage metadata and verified pricing rates. The primary production path uses `estimateAnthropicCostVerified` (fed by `pricing-verifier.ts`); `estimateAnthropicCost` with an `AnthropicPricingTable` is retained for tests and the legacy HTML-scraper path.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
ANTHROPIC_PRICING_URL: 'https://platform.claude.com/docs/en/about-claude/pricing'

ANTHROPIC_USAGE_COST_URL: 'https://docs.anthropic.com/en/api/data-usage-cost-api'

type AnthropicPricingSource = 'live' | 'fallback';

interface AnthropicTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheCreation5mInputTokens: number;
  cacheCreation1hInputTokens: number;
  cacheReadInputTokens: number;
  serverToolUse?: Record<string, number>;
  hasRawUsage: boolean;
  inferenceGeo?: string;
}

interface AnthropicModelPricing {
  modelName: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWrite5mPerMillion: number;
  cacheWrite1hPerMillion: number;
  cacheReadPerMillion: number;
}

interface AnthropicPricingTable {
  source: AnthropicPricingSource;
  sourceUrl: string;
  fetchedAt: string;
  updatedAt?: string;
  models: Record<string, AnthropicModelPricing>;
}

interface CostEstimateBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWrite5mPerMillion: number;
  cacheWrite1hPerMillion: number;
  cacheReadPerMillion: number;
  inputUsd: number;
  outputUsd: number;
  cacheWrite5mUsd: number;
  cacheWrite1hUsd: number;
  cacheReadUsd: number;
  multiplier: number;
}

interface CostEstimate {
  usd: number | null;
  formattedUsd: string;
  source: AnthropicPricingSource;
  sourceUrl: string;
  fetchedAt: string;
  updatedAt?: string;
  breakdown?: CostEstimateBreakdown;
  warnings: string[];
  confidence?: PricingConfidence;
}

createSessionCostTracker(): { reset(): void; add(estimate: CostEstimate | null | undefined): number; get(): number; }

resetAnthropicSessionCost(): void

addAnthropicSessionCost(estimate: CostEstimate | null | undefined): number

getAnthropicSessionCost(): number

formatUsdCeil(usd: number | null | undefined): string

describeCostEstimate(estimate: CostEstimate | null | undefined, opts?: { colored?: boolean | undefined; } | undefined): string

describeCostEstimateBreakdown(estimate: CostEstimate | null | undefined): string | null

modelPricingKey(modelId: string): string

parseAnthropicPricingHtml(html: string, fetchedAt?: string): AnthropicPricingTable

getAnthropicPricing(): Promise<AnthropicPricingTable>

estimateAnthropicCostVerified(modelId: string, usage: AnthropicTokenUsage | null | undefined, rates: VerifiedRates): CostEstimate

estimateAnthropicCost(modelId: string, usage: AnthropicTokenUsage | null | undefined, pricingTable: AnthropicPricingTable): CostEstimate
```
<!-- END GENERATED EXPORTS -->

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
