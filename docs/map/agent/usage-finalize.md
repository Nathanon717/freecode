# src/agent/usage-finalize.ts - Turn Usage/Cost/Quota Finalization

**Role:** Ends the per-provider usage capture at the close of a model turn, estimates turn cost (Anthropic only), and reads the last-captured rate-limit headers into a single `UsageOutcome`. Extracted from `loop.ts` (which was at the 500-line limit) as the cohesive "what did this turn cost / how much quota is left" concern; `loop.ts` calls it from both the success and error paths so partial cost/quota metadata survives stream failures.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface UsageOutcome {
  providerUsage?: CapturedProviderUsage[];
  costEstimate?: CostEstimate;
  promptTokens?: number;
  outputTokens?: number;
  quota: RateLimitSnapshot | null;
}

finalizeUsageCapture(providerId: string, modelId: string, promptTokens: number | undefined, outputTokens: number | undefined): Promise<UsageOutcome>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `finalizeUsageCapture(providerId, modelId, promptTokens, outputTokens)` — for `anthropic`, ends the SSE usage capture, fetches verified rates, and returns a `costEstimate`; it also overrides `promptTokens`/`outputTokens` with Anthropic's own reported numbers. For every other provider it ends the generic provider usage capture. Then, unless `DEBUG_QUOTA=0`, it reads the last-captured rate-limit headers.
- Note: the `promptTokens` this returns for Anthropic is `inputTokens` only — it excludes `cache_read`/`cache_creation`, so it undercounts on Claude models with prompt caching active. Because of that, `cli/session-modes.ts` currently **suppresses** the footer `ctx` slot for Anthropic rather than display the low number; summing the cache fields here is the follow-up that will let the slot show Anthropic too. Non-Anthropic providers report a cache-inclusive prompt count and are shown.

## Read When

- Changing how a turn's cost, provider usage, or quota headers are gathered.
- Adding a provider whose usage/cost reporting differs from the OpenAI-compatible default.

## Key Neighbors

- [`loop.ts`](loop.md) — the sole caller; feeds the result through `applyUsageOutcome`.
- [`../providers/anthropic-cost.md`](../providers/anthropic-cost.md) — `estimateAnthropicCostVerified` / `CostEstimate`.
- [`../providers/adapters/openai-compat.md`](../providers/adapters/openai-compat.md), [`../providers/adapters/anthropic.md`](../providers/adapters/anthropic.md) — the capture stores it ends.
