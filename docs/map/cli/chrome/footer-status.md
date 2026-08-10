# src/cli/chrome/footer-status.ts - Footer Status State and Formatters

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Owns the mutable state for the footer status display, all formatting helpers, and the multi-row layout logic.

## Read When

Changing what is shown in the footer status area, adding new status fields, or debugging the multi-row layout.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
setQuotaSnapshot(quota: RateLimitSnapshot | null): void

/**
 * Set the live conversation's context size for the footer's `ctx` slot.
 *
 * `tokens` is the *provider-reported* prompt (input) token count of the most
 * recent API call, which already equals the whole message history because every
 * call resends it — so this is latest-wins and never a running sum (a running
 * sum across eval turns was the old bug). `window` is the model's context
 * window when known, else null. Pass `null` to blank the slot: never measured,
 * or the model just changed, and the footer shows nothing rather than a
 * fabricated estimate.
 */
setContextUsage(usage: { tokens: number; window: number | null; } | null): void

setActiveModel(providerId: string, modelId: string): void

setActiveModelFromString(model: string): void

setOpenAIDailySpend(snapshot: OpenAIDailySpend): void

setRetryBanner(info: { name: string; label: string; targetMs: number; } | null): void

/**
 * The retry-banner string for the footer's left side; `''` when no retry is pending.
 */
formatEvalRunStatus(now?: number): string

/**
 * Lay out the right-side footer content into 1..`rowBudget` rows. `result[0]` is
 * the bottom (primary) row, `result[1]` the row above it, and so on.
 *
 * Primary-row priority is model → ctx → quota, kept longest to shortest; the
 * secondary content (OpenAI spend) drops first. `rowBudget` of 1 matches the old
 * single-row drop behaviour, which existing tests rely on.
 */
layoutFooterRightRows(width: number, rowBudget: number, now?: number): string[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/openai-daily-spend.ts`](../../providers/openai-daily-spend.md) ×2, [`providers/quota/headers.ts`](../../providers/quota/headers.md) ×2
- **Imported by:** [`cli/session-modes.ts`](../session-modes.md) ×9, [`cli/eval/custom-eval-menu.ts`](../eval/custom-eval-menu.md) ×7, [`cli/chrome/bottom-ui.ts`](bottom-ui.md) ×2, [`cli/eval/humaneval-menu.ts`](../eval/humaneval-menu.md) ×1

## Tests

`tests/cli/chrome/footer-status.test.ts`. 4 other test files reference it.

## Budget

225 / 500 lines (275 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

The `ctx` slot shows **measured** context size — the provider's own `prompt_tokens` for the last call — not a local tokenizer estimate. It is deliberately *not* built on `src/tokenizers/count.ts`: a computed estimate would undercount (it never sees tool schemas or provider-injected content) and, once output/reasoning tokens enter the arithmetic, becomes provider-specific and easy to get silently wrong. The renderer does zero arithmetic beyond `N/M` and shows nothing until a real count arrives, so it can never display a fabricated number. Format is raw integers (`12345/128000 ctx`, or `12345 ctx` when the window is unknown) — no separators, no percentage, no rounding, so tests can pin exact digits. History: this replaces the earlier multi-writer `setTokenCount`/`${n} ctx` slot, whose five callers each fed it a different quantity (local estimate, last-call input, cumulative eval totals) — the eval cumulative-sum path is why the old `ctx` could exceed the context window.
