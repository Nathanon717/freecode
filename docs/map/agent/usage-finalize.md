# src/agent/usage-finalize.ts - Turn Usage/Quota Finalization

**Role:** Ends the per-provider usage capture at the close of a model turn and reads the last-captured rate-limit headers into a single `UsageOutcome`. Extracted from `loop.ts` (which was at the 500-line limit) as the cohesive "what usage/quota is left after this turn" concern; `loop.ts` calls it from both the success and error paths so partial usage/quota metadata survives stream failures.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface UsageOutcome {
  /** Always present; empty when the provider reported no usage. */
  providerUsage: CapturedProviderUsage[];
  promptTokens?: number;
  outputTokens?: number;
  quota: RateLimitSnapshot | null;
}

finalizeUsageCapture(providerId: string, promptTokens: number | undefined, outputTokens: number | undefined): Promise<UsageOutcome>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `finalizeUsageCapture(providerId, promptTokens, outputTokens)` — ends the generic OpenAI-compatible provider usage capture (every provider, including Anthropic, routes through it). Then, unless `DEBUG_QUOTA=0`, it reads the last-captured rate-limit headers. `promptTokens`/`outputTokens` pass through unchanged from the caller.

## Read When

- Changing how a turn's provider usage or quota headers are gathered.
- Adding a provider whose usage reporting differs from the OpenAI-compatible default.

## Key Neighbors

- [`loop.ts`](loop.md) — the sole caller; feeds the result through `applyUsageOutcome`.
- [`../providers/adapters/openai-compat.md`](../providers/adapters/openai-compat.md) — the capture store it ends.
