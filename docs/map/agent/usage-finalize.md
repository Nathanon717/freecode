# src/agent/usage-finalize.ts - Turn Usage/Quota Finalization

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Ends the per-provider usage capture at the close of a model turn and reads the last-captured rate-limit headers into a single `UsageOutcome`. Extracted from `loop.ts` (which was at the 500-line limit) as the cohesive "what usage/quota is left after this turn" concern; `loop.ts` calls it from both the success and error paths so partial usage/quota metadata survives stream failures.

## Read When

- Changing how a turn's provider usage or quota headers are gathered.
- Adding a provider whose usage reporting differs from the OpenAI-compatible default.
<!-- END GENERATED MAP INTENT -->

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

/**
 * End any active usage capture for the provider and read captured rate-limit
 * headers. Shared by the success and error paths of agentLoop so partial
 * usage/quota metadata survives stream failures.
 */
finalizeUsageCapture(providerId: string, promptTokens: number | undefined, outputTokens: number | undefined): Promise<UsageOutcome>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×3, [`providers/adapters/openai-compat.ts`](../providers/adapters/openai-compat.md) ×3, [`providers/quota/headers.ts`](../providers/quota/headers.md) ×2
- **Imported by:** [`agent/loop.ts`](loop.md) ×3

## Tests

`tests/agent/usage-finalize.test.ts`.

## Budget

41 / 500 lines (459 to spare).

## Env

`DEBUG_QUOTA`
<!-- END GENERATED MAP FACTS -->

## Export notes

- `finalizeUsageCapture(providerId, promptTokens, outputTokens)` — ends the generic OpenAI-compatible provider usage capture (every provider, including Anthropic, routes through it). Then, unless `DEBUG_QUOTA=0`, it reads the last-captured rate-limit headers. `promptTokens`/`outputTokens` pass through unchanged from the caller.

## Key Neighbors

- [`loop.ts`](loop.md) — the sole caller; feeds the result through `applyUsageOutcome`.
- [`../providers/adapters/openai-compat.md`](../providers/adapters/openai-compat.md) — the capture store it ends.
