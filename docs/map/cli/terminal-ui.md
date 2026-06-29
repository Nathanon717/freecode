# src/cli/terminal-ui.ts - Bottom Terminal UI

**Role:** Renders and controls the bottom-pinned prompt/status area. Owns only the ANSI scroll-region state and input-area overlay logic; status state lives in `footer-status.ts` and buffer/cursor state lives in `input-buffer.ts`. Re-exports everything from those modules for backwards-compat callers.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export {
  setTokenCount,
  setQuotaSnapshot,
  setActiveModel,
  setActiveModelFromString,
  setOpenAIDailySpend,
  setRetryBanner,
  composeBottomRightStatus,
  composeBottomStatusLine,
} from './footer-status.js'

export {
  getInputBuffer,
  setInputBuffer,
  insertAtCursor,
  backspaceAtCursor,
  deleteAtCursor,
  moveCursorLeft,
  moveCursorRight,
  moveCursorHome,
  moveCursorEnd,
  moveCursorUp,
  moveCursorDown,
  visualRowsForLine,
  cursorToVisualPos,
} from './input-buffer.js'

isBottomUIActive(): boolean

isFooterUIActive(): boolean

suspendFooterTimer(): void

resumeFooterTimer(): void

getRows(): number

getLastReservedRows(): number

setSuggestions(suggestions: string[]): void

setInlineCompletion(completion: string | null): void

getInlineCompletionSuffix(input: string, completion: string | null): string

composeFooterOutput(): string

drawFooter(): void

drawBottomUI(): void

parkCursorInScrollRegion(): void

parkCursorAboveBottomUI(): void

setupFooterUI(): void

setupInputUI(): void

setupBottomUI(): void

teardownBottomUI(): void

teardownFooterUI(): void

resetSubmittedInputArea(): void

setOnResizeCallback(cb: (() => void) | null): void
```
<!-- END GENERATED EXPORTS -->

## Layout

The module uses ANSI scroll-region controls so normal output scrolls above the reserved bottom rows.

**Footer** (always active): 2 rows normally; expands to 3 rows when content overflows at narrow terminal widths (only when the input UI is not active). The bottom row (`r`) carries the primary status (model + quota/ctx); the row above (`r-1`) carries the toggle bar on the left (from `cli/toggles.ts`) and any secondary content (OpenAI daily spend, preflight cost) on the right. The toggle bar is part of the input-bar component: it is drawn iff `inputUIActive`, so it always hides/shows together with the input UI (e.g. it disappears under picker menus and tool-approval prompts, which tear down the input bar). `footerRowCount` tracks the current size and the scroll region is updated inline when it changes.

**Input UI** (active while the user is typing): top bar + N input lines + bottom bar above the footer. Total reserved = `footerRowCount + 2 + N` where N = number of lines in the current input buffer (minimum 1). When the user inserts a `\n` (Ctrl+J), N increases and `drawInputArea` scrolls content up to make room; when a line is deleted N decreases and the reclaimed rows are cleared. Slash-command suggestions are drawn as an overlay above the top bar; when suggestions appear the renderer snapshots the underlying scroll-region rows via `getScreenBufferDisplayLinesForOverlay` (styled, ANSI codes intact) and repaints them when the overlay closes. Restore uses `maxWidth = width` (full terminal width) — using `width - 1` truncates 80-char lines and leaves ANSI color artifacts. The start row is captured at draw time into `suggestionOverlayStartRow` so that footer row count changes between open and close do not corrupt the repaint target. The overlay epoch is started on the first `setupInputUI` call so that pre-UI output (startup banner) is excluded from repaints.

A `cursorPos` index tracks the insertion point within the flat buffer (with embedded `\n` for multi-line). `cursorLineCol()` converts it to (lineIdx, colInLine) at draw time. The cursor position is updated by the cursor-movement exports. Inline completion is only shown when the buffer is single-line.

The input row shows the prompt and inline completion. The status row right-aligns model, OpenAI daily spend, quota, and context-token count (displayed as `N ctx`).

## Quota Display

`setQuotaSnapshot()` accepts Groq rate-limit headers. The UI estimates refill over time using the reset durations and refreshes once per second while active.

## Resize

On `process.stdout` `resize`, the handler debounces at 32 ms (smooth during drag), then: invalidates the suggestion overlay (stale absolute row positions), resets `footerRowCount` and `lastReservedRows` to their defaults so `drawFooter`/`drawInputArea` recompute from the new dimensions, clears the visible screen without erasing scrollback (`\x1b[2J`), redraws the banner at the new width via `clearAndRedrawBanner()` (imported from `banner.ts`), re-establishes the scroll region, and calls `drawBottomUI()`. In-progress input buffer and conversation memory are preserved across resize.

## Cleanup

Process-exit handler restores the scroll region and parks the cursor.
