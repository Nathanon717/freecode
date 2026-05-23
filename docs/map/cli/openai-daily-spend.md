# src/cli/openai-daily-spend.ts - OpenAI Daily Spend Footer

**Role:** Fetches and caches the current UTC day's OpenAI organization cost for the interactive footer.

## Exports

- `fetchOpenAITodayCosts(now?)` - calls `GET /v1/organization/costs` with `bucket_width=1d`, `limit=1`, and a UTC-day `start_time`.
- `refreshOpenAIDailySpend(options)` - non-blocking cached refresh helper for UI hooks.
- `resetOpenAIDailySpendCache()` - clears in-memory refresh state for tests.
- `OpenAIDailySpend` - footer snapshot type.

## Behavior

Requires `OPENAI_ADMIN_KEY`; ordinary OpenAI project keys are not used for organization costs. Successful responses sum USD amount values across the returned cost bucket results and cache the snapshot for five minutes.

## Key Neighbors

- [terminal-ui.md](terminal-ui.md): renders the daily spend snapshot in the bottom status line.
- [input-modes.md](input-modes.md): triggers refreshes when the interactive footer is active.
