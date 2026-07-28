# src/cli/chrome/bottom-ui.ts - Bottom Terminal UI

**Role:** Renders and controls the bottom-pinned prompt/status area. Owns only the ANSI scroll-region state and input-area overlay logic; status state lives in `footer-status.ts`, buffer/cursor state in `input-buffer.ts`, and the raw escape sequences in `ansi.ts`. Import those directly — this module does not re-export them.

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

Uses an ANSI scroll-region to pin the footer/input UI to the bottom rows while normal output scrolls above it. Footer is 2 rows normally, 3 when content overflows at narrow widths (only while the input UI is inactive); the input UI adds top/bottom bars plus the current input line count on top of the footer. Slash-command suggestions draw as an overlay that snapshots the scroll-region's screen content to repaint on close; the overlay epoch starts at the first `setupInputUI` call so pre-UI output (startup banner) is excluded from repaints. A `cursorPos` index tracks the insertion point in the flat buffer; `cursorLineCol()` derives (line, col) from it at draw time. A valid leading tool name followed by `(` is tinted pastel via `styleToolNames`/`toolNameHighlightRanges` from `cli/tools/tool-invocation.ts`, applied per visual chunk so ANSI bytes never disturb the width-based wrap math.

### Cursor discipline when the region changes

DECSTBM homes the cursor to (1,1) as a side effect of setting the scroll region. Most callers here immediately absolute-position afterwards, so it doesn't matter — but `setupFooterUI` runs while the startup banner is the only thing on screen and nothing repositions after it, so it brackets the region change with `saveCursorSequence()` / `restoreCursorSequence()`. Without that the cursor sits at the top of the screen and the next `console.log` paints over the banner.

`setupInputUI` then opens its 3 rows for the input frame by writing bare newlines **from wherever the cursor is**, rather than moving to the bottom of the region first. Newlines scroll only once the cursor reaches the bottom margin, so this scrolls by exactly what is needed: 3 rows when output already fills the region (so the frame overwrites nothing), 0 on a fresh screen (so the banner stays put). Those newlines go through `writeChrome` from `screen-buffer.ts` — they carry no cursor escape, so ordinary capture would record them as blank transcript lines and corrupt overlay restore and the resize branch below.

## Quota Display

`setQuotaSnapshot()` accepts Groq rate-limit headers. The UI estimates refill over time using the reset durations and refreshes once per second while active.

## Idle-write suppression

The 1 s refresh timer caches the last footer bytes written (`lastFooterOutput`) and skips the write whenever the freshly-composed footer is byte-identical. When idle (no retry banner / quota / spend) the footer text is static, so an idle prompt emits no periodic output — any output byte makes terminals like Termux snap the viewport back to the bottom, fighting a user who scrolled up to read scrollback. Event-driven redraws (`drawFooter`, teardown, resize) always repaint and refresh the cache; only the timer skips. This does not affect snap-back during active generation, where streaming output legitimately writes. If Groq quota is displayed its estimate changes each second, so writes (and snap-back) continue while it is shown.

`suspendFooterTimer()` freezes the timer entirely (it early-returns and writes nothing) while something else owns the footer rows — a raw picker (`cli/menus/raw-picker.ts`) or the tool-approval prompt (`cli/tools/tool-approval.ts`), which blanks the footer rows and draws its hint on the last row. `resumeFooterTimer()` re-enables it; callers repaint the footer manually (`drawFooter`) on resume.

## Resize

Debounces 32 ms, then re-lays-out based on **what is currently showing** (via `hasPostEpochContent` from `screen-buffer.ts`):

- **Fresh/startup — no transcript yet, banner is on screen:** wipe and redraw the banner at the new width (`clearAndRedrawBanner`). Clean and responsive (compact/full swap), with no stale bottom-bar cells left to reflow into duplicates.
- **A transcript is showing:** do **not** wipe to the banner. Reset the scroll region to full for the new geometry, then repaint the scroll region from the screen buffer (`composeScrollRegionScrub`, wrapped to the new width) and redraw the bottom UI. The repaint is what keeps this clean: the terminal's own SIGWINCH reflow drags the cursor-addressed bottom UI (and any open suggestion overlay) into the scroll region as wrapped ghost copies; neither is in the buffer, so repainting from the buffer erases the ghosts without truncating transcript lines. The transcript ends up bottom-aligned above the input bar. (The banner is pre-epoch, excluded from the buffer, so it is dropped on resize once a transcript exists — matching the pre-fix reflow, which scrolled it off anyway.)
- **A pinned menu owns the screen:** skip the buffer repaint and let the picker redraw itself via `setOnResizeCallback` after the bottom UI is drawn.

Row counts are reset and the scroll region re-established from the new dimensions in both cases. Input buffer and conversation memory persist across resize. Note: `index.ts` strips readline's own `'resize'` listener right after `createInterface`, or it would scribble a stray `> ` and an `\x1b[0J` erase across the reflowed transcript on every resize.

## Cleanup

Process-exit handler restores the scroll region and parks the cursor.
