# src/cli/chrome/footer-status.ts - Footer Status State and Formatters

**Role:** Owns the mutable state for the footer status display, all formatting helpers, and the multi-row layout logic.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
setQuotaSnapshot(quota: RateLimitSnapshot | null): void

setContextUsage(usage: { tokens: number; window: number | null; } | null): void

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
- `setContextUsage` — sets the live conversation's context size for the `ctx` slot. `tokens` is the **provider-reported prompt (input) tokens of the most recent API call** — which already equals the whole history, since every call resends it — so it is *latest-wins, never summed*. `window` is the model's context window (or `null` when unknown). Pass `null` to blank the slot (never measured, or the model just changed). The only writer is `cli/session-modes.ts` — from `onAgentResult` at end of turn and from `onStepUsage` at each step boundary of a multi-step tool turn, so the slot ticks up while the turn runs.
- `layoutFooterRightRows` — lays out right-side footer content into 1–3 rows; `result[0]` is the bottom row. Primary-row priority is model → ctx → quota (kept longest to shortest); OpenAI spend is secondary and drops first.

## Read when

Changing what is shown in the footer status area, adding new status fields, or debugging the multi-row layout.

## Note

The `ctx` slot shows **measured** context size — the provider's own `prompt_tokens` for the last call — not a local tokenizer estimate. It is deliberately *not* built on `src/tokenizers/count.ts`: a computed estimate would undercount (it never sees tool schemas or provider-injected content) and, once output/reasoning tokens enter the arithmetic, becomes provider-specific and easy to get silently wrong. The renderer does zero arithmetic beyond `N/M` and shows nothing until a real count arrives, so it can never display a fabricated number. Format is raw integers (`12345/128000 ctx`, or `12345 ctx` when the window is unknown) — no separators, no percentage, no rounding, so tests can pin exact digits. History: this replaces the earlier multi-writer `setTokenCount`/`${n} ctx` slot, whose five callers each fed it a different quantity (local estimate, last-call input, cumulative eval totals) — the eval cumulative-sum path is why the old `ctx` could exceed the context window.

## Key neighbors

- `cli/chrome/bottom-ui.ts` — imports `layoutFooterRightRows` and `formatEvalRunStatus` for `composeFooterOutput`
- `cli/session-modes.ts`, `cli/eval/custom-eval-menu.ts`, `cli/eval/humaneval-menu.ts`, `index.ts` — import the status setters directly
- `providers/openai-daily-spend.ts` — imports `OpenAIDailySpend` type
- `providers/quota/headers.ts` — imports `RateLimitSnapshot` type
