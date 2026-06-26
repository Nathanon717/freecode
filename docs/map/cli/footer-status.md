# src/cli/footer-status.ts - Footer Status State and Formatters

**Role:** Owns the mutable state for the footer status display, all formatting helpers, and the multi-row layout logic.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
formatQuotaReset(ms: number | null, raw: string | null): string

setTokenCount(tokenCount: number): void

setQuotaSnapshot(quota: RateLimitSnapshot | null): void

setModelStatus(providerId: string, modelId: string): void

setOpenAIDailySpend(snapshot: OpenAIDailySpend): void

setRetryBanner(info: { name: string; label: string; targetMs: number; } | null): void

formatEvalRunStatus(now?: number): string

layoutFooterRightRows(width: number, rowBudget: number, now?: number): string[]

composeBottomRightStatus(width: number, now?: number): string

composeBottomStatusLine(width: number, now?: number): string
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `formatEvalRunStatus` — returns the retry-banner string for the footer left side.
- `layoutFooterRightRows` — lays out right-side footer content into 1–3 rows; `result[0]` is the bottom row.
- `composeBottomRightStatus` — single-row right status string.
- `composeBottomStatusLine` — right-aligned full-width status line.

## Read when

Changing what is shown in the footer status area, adding new status fields, or debugging the multi-row layout.

## Key neighbors

- `cli/terminal-ui.ts` — imports `layoutFooterRightRows` and `formatEvalRunStatus` for `composeFooterOutput`; re-exports everything for backwards-compat callers
- `providers/openai-daily-spend.ts` — imports `OpenAIDailySpend` type
- `providers/quota/headers.ts` — imports `RateLimitSnapshot` type
