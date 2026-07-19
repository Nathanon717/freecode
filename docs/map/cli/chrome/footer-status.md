# src/cli/chrome/footer-status.ts - Footer Status State and Formatters

**Role:** Owns the mutable state for the footer status display, all formatting helpers, and the multi-row layout logic.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
setQuotaSnapshot(quota: RateLimitSnapshot | null): void

setActiveModel(providerId: string, modelId: string): void

setActiveModelFromString(model: string): void

setOpenAIDailySpend(snapshot: OpenAIDailySpend): void

setRetryBanner(info: { name: string; label: string; targetMs: number; } | null): void

formatEvalRunStatus(now?: number): string

layoutFooterRightRows(width: number, rowBudget: number, now?: number): string[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `formatEvalRunStatus` — returns the retry-banner string for the footer left side.
- `layoutFooterRightRows` — lays out right-side footer content into 1–3 rows; `result[0]` is the bottom row.

## Read when

Changing what is shown in the footer status area, adding new status fields, or debugging the multi-row layout.

## Note

The footer has no token-count slot as of the tokenizer-engine work (`docs/plans/tokenizer-registry-plan.md` Phase 1): `setTokenCount`/`lastTokenCount` and the `${n} ctx` fallback text were removed along with `agent/token-count.ts`. `layoutFooterRightRows` now lays out quota | model | spend only. A later "live counter" task re-adds a token display on top of `src/tokenizers/count.ts`.

## Key neighbors

- `cli/chrome/bottom-ui.ts` — imports `layoutFooterRightRows` and `formatEvalRunStatus` for `composeFooterOutput`
- `cli/session-modes.ts`, `cli/eval/custom-eval-menu.ts`, `cli/eval/humaneval-menu.ts`, `index.ts` — import the status setters directly
- `providers/openai-daily-spend.ts` — imports `OpenAIDailySpend` type
- `providers/quota/headers.ts` — imports `RateLimitSnapshot` type
