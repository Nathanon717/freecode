# src/providers/openai-daily-spend.ts - OpenAI Daily Spend Footer

**Role:** Fetches and caches the current UTC day's OpenAI organization cost for the interactive footer.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface OpenAIDailySpend {
  state: 'idle' | 'pending' | 'ready' | 'unavailable';
  amountUsd?: number;
  formattedAmountUsd?: string;
  startTime?: number;
  endTime?: number;
  updatedAt: number;
  warning?: string;
}

resetOpenAIDailySpendCache(): void

isOpenAIModelPreference(modelPreference: string | undefined): boolean

fetchOpenAITodayCosts(now?: Date): Promise<OpenAIDailySpend>

refreshOpenAIDailySpend(options: OpenAIDailySpendRefreshOptions): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/chrome/footer-status.ts`](../cli/chrome/footer-status.md) ×2, [`cli/session-modes.ts`](../cli/session-modes.md) ×1

## Tests

`tests/providers/openai-daily-spend.test.ts`. 1 other test file references it.

## Budget

180 / 500 lines (320 to spare).

## Env

`OPENAI_ADMIN_KEY`
<!-- END GENERATED MAP FACTS -->

## Export notes

- `fetchOpenAITodayCosts(now?)` — calls `GET /v1/organization/costs` with `bucket_width=1d`, `limit=1`, and a UTC-day `start_time`.
- `refreshOpenAIDailySpend(options)` — non-blocking cached refresh helper for UI hooks.
- `isOpenAIModelPreference(modelPreference)` — detects selected `openai:<model>` preferences for footer gating.
- `resetOpenAIDailySpendCache()` — clears in-memory refresh state for tests.
- `OpenAIDailySpend` — footer snapshot type.

## Behavior

Requires `OPENAI_ADMIN_KEY`; ordinary OpenAI project keys are not used for organization costs. When a model preference is supplied, refreshes and cached snapshots are displayed only for selected OpenAI models. Successful responses sum USD amount values across the returned cost bucket results and cache the snapshot for five minutes.

## Key Neighbors

- [cli/footer-status.md](../cli/chrome/footer-status.md): imports `OpenAIDailySpend` type from this module.
- [cli/session-modes.md](../cli/session-modes.md): triggers refreshes when the interactive footer is active.
