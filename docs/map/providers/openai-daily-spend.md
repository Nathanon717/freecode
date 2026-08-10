# src/providers/openai-daily-spend.ts - OpenAI Daily Spend Footer

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Fetches and caches the current UTC day's OpenAI organization cost for the interactive footer.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * The footer's snapshot of the current UTC day's OpenAI organization cost.
 */
interface OpenAIDailySpend {
  state: 'idle' | 'pending' | 'ready' | 'unavailable';
  amountUsd?: number;
  formattedAmountUsd?: string;
  startTime?: number;
  endTime?: number;
  updatedAt: number;
  warning?: string;
}

/**
 * Clears the in-memory refresh state; for tests.
 */
resetOpenAIDailySpendCache(): void

/**
 * Whether the selected preference is an `openai:<model>` one — the footer slot's gate.
 */
isOpenAIModelPreference(modelPreference: string | undefined): boolean

/**
 * `GET /v1/organization/costs` with `bucket_width=1d`, `limit=1`, and a UTC-day `start_time`.
 */
fetchOpenAITodayCosts(now?: Date): Promise<OpenAIDailySpend>

/**
 * Non-blocking cached refresh, for UI hooks that must not await a network call.
 */
refreshOpenAIDailySpend(options: OpenAIDailySpendRefreshOptions): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/chrome/footer-status.ts`](../cli/chrome/footer-status.md) ×2, [`cli/session-modes.ts`](../cli/session-modes.md) ×1

## Tests

`tests/providers/openai-daily-spend.test.ts`. 1 other test file references it.

## Budget

185 / 500 lines (315 to spare).

## Env

`OPENAI_ADMIN_KEY`
<!-- END GENERATED MAP FACTS -->

## Behavior

Requires `OPENAI_ADMIN_KEY`; ordinary OpenAI project keys are not used for organization costs. When a model preference is supplied, refreshes and cached snapshots are displayed only for selected OpenAI models. Successful responses sum USD amount values across the returned cost bucket results and cache the snapshot for five minutes.
