# src/cli/terminal-ui.ts - Bottom Terminal UI

**Role:** Maintains the bottom-pinned prompt/status area used by interactive mode.

## Exports

State setters/getters:

- `isBottomUIActive()`
- `getInputBuffer()`, `setInputBuffer()`
- `insertAtCursor(text)`, `backspaceAtCursor()`, `deleteAtCursor()` — cursor-aware buffer mutations
- `moveCursorLeft()`, `moveCursorRight()`, `moveCursorHome()`, `moveCursorEnd()`, `moveCursorUp()`, `moveCursorDown()` — cursor navigation
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

**Footer** (always active): 2 rows normally; expands to 3 rows when content overflows at narrow terminal widths (only when the input UI is not active). The bottom row (`r`) carries the primary status (model + quota/ctx); the row above (`r-1`) carries the toggle bar on the left (from `cli/toggles.ts`) and any secondary content (OpenAI daily spend, preflight cost) on the right. `footerRowCount` tracks the current size and the scroll region is updated inline when it changes.

**Input UI** (active while the user is typing): top bar + N input lines + bottom bar above the footer. Total reserved = `footerRowCount + 2 + N` where N = number of lines in the current input buffer (minimum 1). When the user inserts a `\n` (Ctrl+J), N increases and `drawInputArea` scrolls content up to make room; when a line is deleted N decreases and the reclaimed rows are cleared. Slash-command suggestions are drawn as an overlay above the top bar; when suggestions appear the renderer snapshots the underlying scroll-region rows via `getScreenBufferDisplayLinesForOverlay` (styled, ANSI codes intact) and repaints them when the overlay closes. Restore uses `maxWidth = width` (full terminal width) — using `width - 1` truncates 80-char lines and leaves ANSI color artifacts. The start row is captured at draw time into `suggestionOverlayStartRow` so that footer row count changes between open and close do not corrupt the repaint target. The overlay epoch is started on the first `setupInputUI` call so that pre-UI output (startup banner) is excluded from repaints.

A `cursorPos` index tracks the insertion point within the flat buffer (with embedded `\n` for multi-line). `cursorLineCol()` converts it to (lineIdx, colInLine) at draw time. The cursor position is updated by the cursor-movement exports. Inline completion is only shown when the buffer is single-line.

The input row shows the prompt and inline completion. The status row right-aligns model, OpenAI daily spend, OpenAI preflight input cost, quota, and context-token count (displayed as `N ctx`).

## Preflight Input Cost

`setPreflightInputCost()` accepts a `PreflightInputCost` snapshot from `preflight-input-cost.ts`. Only `ready` snapshots are rendered, formatted as exact input tokens plus input-token cost, for example `12,431 in tok | $0.0186 input`.

## Quota Display

`setQuotaSnapshot()` accepts Groq rate-limit headers. The UI estimates refill over time using the reset durations and refreshes once per second while active.

## Cleanup

Resize and process-exit handlers restore the scroll region or redraw the bottom UI as needed.
