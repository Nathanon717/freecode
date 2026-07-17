# src/cli/bottom-ui.ts - Bottom Terminal UI

**Role:** Renders and controls the bottom-pinned prompt/status area. Owns only the ANSI scroll-region state and input-area overlay logic; status state lives in `footer-status.ts` and buffer/cursor state lives in `input-buffer.ts`. Import those directly — this module does not re-export them.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
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

Uses an ANSI scroll-region to pin the footer/input UI to the bottom rows while normal output scrolls above it. Footer is 2 rows normally, 3 when content overflows at narrow widths (only while the input UI is inactive); the input UI adds top/bottom bars plus the current input line count on top of the footer. Slash-command suggestions draw as an overlay that snapshots the scroll-region's screen content to repaint on close; the overlay epoch starts at the first `setupInputUI` call so pre-UI output (startup banner) is excluded from repaints. A `cursorPos` index tracks the insertion point in the flat buffer; `cursorLineCol()` derives (line, col) from it at draw time. A valid leading tool name followed by `(` is tinted pastel via `styleToolNames`/`toolNameHighlightRanges` from `cli/tool-invocation.ts`, applied per visual chunk so ANSI bytes never disturb the width-based wrap math.

## Quota Display

`setQuotaSnapshot()` accepts Groq rate-limit headers. The UI estimates refill over time using the reset durations and refreshes once per second while active.

## Idle-write suppression

The 1 s refresh timer caches the last footer bytes written (`lastFooterOutput`) and skips the write whenever the freshly-composed footer is byte-identical. When idle (no retry banner / quota / spend) the footer text is static, so an idle prompt emits no periodic output — any output byte makes terminals like Termux snap the viewport back to the bottom, fighting a user who scrolled up to read scrollback. Event-driven redraws (`drawFooter`, teardown, resize) always repaint and refresh the cache; only the timer skips. This does not affect snap-back during active generation, where streaming output legitimately writes. If Groq quota is displayed its estimate changes each second, so writes (and snap-back) continue while it is shown.

`suspendFooterTimer()` freezes the timer entirely (it early-returns and writes nothing) while something else owns the footer rows — a raw picker (`cli/raw-picker.ts`) or the tool-approval prompt (`cli/tool-approval.ts`), which blanks the footer rows and draws its hint on the last row. `resumeFooterTimer()` re-enables it; callers repaint the footer manually (`drawFooter`) on resume.

## Resize

Debounces 32 ms, then recomputes the scroll region: invalidates the suggestion overlay, resets footer/input row counts to defaults, redraws the banner at the new width, and re-establishes the region and bottom UI. Input buffer and conversation memory persist across resize.

## Cleanup

Process-exit handler restores the scroll region and parks the cursor.
