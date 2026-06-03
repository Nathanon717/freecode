# src/cli/terminal-ui.ts - Bottom Terminal UI

**Role:** Maintains the bottom-pinned prompt/status area used by interactive mode.

## Exports

State setters/getters:

- `isBottomUIActive()`
- `getInputBuffer()`, `setInputBuffer()`, `appendToInputBuffer()`, `backspaceInputBuffer()`
- `setTokenCount()`
- `setQuotaSnapshot()`
- `setModelStatus()`
- `setOpenAIDailySpend()`
- `setPreflightInputCost()`
- `setSuggestions()`
- `setInlineCompletion()`
- `setRetryBanner(info | null)` — sets a rate-limit countdown shown on the footer left side; `info` has `{ name, label, targetMs }` and remaining seconds are computed from `targetMs` each footer refresh

Rendering/control:

- `composeBottomRightStatus()`
- `composeBottomStatusLine()`
- `getInlineCompletionSuffix()`
- `drawBottomUI()`
- `parkCursorInScrollRegion()`
- `parkCursorAboveBottomUI()`
- `setupBottomUI()`
- `teardownBottomUI()`
- `resetSubmittedInputArea()`

## Layout

The module uses ANSI scroll-region controls so normal output scrolls above the reserved bottom rows.

**Footer** (always active): 2 rows normally; expands to 3 rows when content overflows at narrow terminal widths (only when the input UI is not active). The bottom row carries the primary status (model + quota/ctx); the row above carries secondary content (OpenAI daily spend, preflight cost). `footerRowCount` tracks the current size and the scroll region is updated inline when it changes.

**Input UI** (active while the user is typing): 3 rows above the footer (top bar, input line, bottom bar) plus one row per suggestion. Total reserved = `footerRowCount + 3 + suggestion_count`.

The input row shows the prompt and inline completion. The status row right-aligns model, OpenAI daily spend, OpenAI preflight input cost, quota, and context-token count (displayed as `N ctx`).

## Preflight Input Cost

`setPreflightInputCost()` accepts a `PreflightInputCost` snapshot from `preflight-input-cost.ts`. Only `ready` snapshots are rendered, formatted as exact input tokens plus input-token cost, for example `12,431 in tok | $0.0186 input`.

## Quota Display

`setQuotaSnapshot()` accepts Groq rate-limit headers. The UI estimates refill over time using the reset durations and refreshes once per second while active.

## Cleanup

Resize and process-exit handlers restore the scroll region or redraw the bottom UI as needed.
