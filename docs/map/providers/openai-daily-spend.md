# src/providers/openai-daily-spend.ts - OpenAI Daily Spend Footer

**Role:** Fetches and caches the current UTC day's OpenAI organization cost for the interactive footer.

## Exports

- `fetchOpenAITodayCosts(now?)` - calls `GET /v1/organization/costs` with `bucket_width=1d`, `limit=1`, and a UTC-day `start_time`.
- `refreshOpenAIDailySpend(options)` - non-blocking cached refresh helper for UI hooks.
- `isOpenAIModelPreference(modelPreference)` - detects selected `openai:<model>` preferences for footer gating.
- `resetOpenAIDailySpendCache()` - clears in-memory refresh state for tests.
- `OpenAIDailySpend` - footer snapshot type.

## Behavior

Requires `OPENAI_ADMIN_KEY`; ordinary OpenAI project keys are not used for organization costs. When a model preference is supplied, refreshes and cached snapshots are displayed only for selected OpenAI models. Successful responses sum USD amount values across the returned cost bucket results and cache the snapshot for five minutes.

## Key Neighbors

- [cli/footer-status.md](../cli/footer-status.md): imports `OpenAIDailySpend` type from this module.
- [cli/session-modes.md](../cli/session-modes.md): triggers refreshes when the interactive footer is active.
