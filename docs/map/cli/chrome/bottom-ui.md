# src/cli/chrome/bottom-ui.ts - Bottom Terminal UI

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Renders and controls the bottom-pinned prompt/status area. Owns only the ANSI scroll-region state and the input-area layout; the state it draws lives in sibling modules, which callers import directly — this module does not re-export them.

## Read When

- Debugging idle footer timer output snapping the Termux viewport (lastFooterOutput byte-compare skip).
- Fixing terminal resize reflow ghost rows from the cursor-addressed input frame (SIGWINCH scrub).
- Changing reserved-row geometry shared by footer, input frame, suggestions overlay, and thinking label.
<!-- END GENERATED MAP INTENT -->

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

/**
 * Register a callback to run after each resize redraw (e.g. a raw picker that needs to repaint). Pass null to unregister.
 */
setOnResizeCallback(cb: (() => void) | null): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/chrome/ansi.ts`](ansi.md) ×65, [`cli/chrome/input-buffer.ts`](input-buffer.md) ×9, [`cli/chrome/suggestion-overlay.ts`](suggestion-overlay.md) ×8, [`util/screen-buffer.ts`](../../util/screen-buffer.md) ×5, [`cli/chrome/turn-state.ts`](turn-state.md) ×4, [`cli/render/banner.ts`](../render/banner.md) ×4, [`cli/chrome/footer-status.ts`](footer-status.md) ×2, [`cli/chrome/toggles.ts`](toggles.md) ×2, [`cli/tools/tool-invocation.ts`](../tools/tool-invocation.md) ×2
- **Imported by:** [`cli/session-modes.ts`](../session-modes.md) ×31, [`cli/tools/tool-approval.ts`](../tools/tool-approval.md) ×16, [`cli/menus/raw-picker.ts`](../menus/raw-picker.md) ×15, [`cli/menus/menu-shell.ts`](../menus/menu-shell.md) ×3, [`cli/eval/eval-menu.ts`](../eval/eval-menu.md) ×1

## Tests

`tests/cli/chrome/bottom-ui.test.ts`. 6 other test files reference it.

## Budget

485 / 500 lines (15 to spare).
<!-- END GENERATED MAP FACTS -->

## Layout

Uses an ANSI scroll-region to pin the footer/input UI to the bottom rows while normal output scrolls above it. Footer is 2 rows normally, 3 when content overflows at narrow widths (only while the input UI is inactive); the input UI adds top/bottom bars plus the current input line count on top of the footer, plus one more row for the `thinking…` label while a turn is in flight. That row's cost is fixed at 1 whatever the label says, so the activity verbs (`grepping…`, `shelling…`, `delegating…` — see [turn-state.md](turn-state.md)) never touch this math; a verb change repaints the row via the listener registered next to `showThinking()`. Slash-command suggestions draw as an overlay whose snapshot/restore lives in [suggestion-overlay.md](suggestion-overlay.md); the overlay epoch starts at the first `setupInputUI` call so pre-UI output (startup banner) is excluded from repaints.

**`reservedRows()` is the single source of truth for how many rows the bottom UI holds out of the scroll region.** That expression used to be recomputed independently at five call sites (`setupInputUI`, `composeFooterOutput`, `drawInputArea`, `resetSubmittedInputArea`, the resize handler); any one of them disagreeing drifts the scroll region from what is actually drawn. `setupInputUI` derives its newline count from it too, so the frame opens at whatever height the label state implies rather than a hardcoded 3.

Note the 3rd footer row is now effectively unreachable in the interactive TTY: it is gated on the input UI being *inactive*, and the input bar now stays up for the whole turn. Secondary right-side content (OpenAI spend drops first) is therefore capped at 2 rows at narrow widths where it previously gained a row mid-turn. A `cursorPos` index tracks the insertion point in the flat buffer; `cursorLineCol()` derives (line, col) from it at draw time. A valid leading tool name followed by `(` is tinted pastel via `styleToolNames`/`toolNameHighlightRanges` from `cli/tools/tool-invocation.ts`, applied per visual chunk so ANSI bytes never disturb the width-based wrap math.

### Cursor discipline when the region changes

DECSTBM homes the cursor to (1,1) as a side effect of setting the scroll region. Most callers here immediately absolute-position afterwards, so it doesn't matter — but `setupFooterUI` runs while the startup banner is the only thing on screen and nothing repositions after it, so it brackets the region change with `saveCursorSequence()` / `restoreCursorSequence()`. Without that the cursor sits at the top of the screen and the next `console.log` paints over the banner.

`setupInputUI` then opens its 3 rows for the input frame by writing bare newlines **from wherever the cursor is**, rather than moving to the bottom of the region first. Newlines scroll only once the cursor reaches the bottom margin, so this scrolls by exactly what is needed: 3 rows when output already fills the region (so the frame overwrites nothing), 0 on a fresh screen (so the banner stays put). Those newlines go through `writeChrome` from `screen-buffer.ts` — they carry no cursor escape, so ordinary capture would record them as blank transcript lines and corrupt overlay restore and the resize branch below.

## Cursor discipline during an agent turn

The input bar is **not** torn down for the turn — only the tool-approval prompt takes it down (`cli/tools/tool-approval.ts`). That means the transcript streams into the scroll region while the input frame is still drawn, and the two compete for the cursor.

The rule: **while `isTurnActive()`, nothing may leave the cursor inside the input frame.** `drawInputArea` therefore wraps its whole write in `saveCursorSequence()`/`restoreCursorSequence()` instead of parking at the typing caret — the same discipline `composeFooterOutput` already uses to survive concurrent output. Miss it and the next streamed byte paints inside the input bar. Paths that reach `drawInputArea` mid-turn: `drawBottomUI`, the 1 s footer timer (only when `footerRowCount` changed, which is easy to overlook), and the tool-approval restore.

`session-modes.ts` `beforeAgentCall` hands the cursor back with `parkCursorInScrollRegion()` after the initial redraw; from there the turn's output owns it.

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

## Notes

State this module draws but does not own: status in [footer-status.md](footer-status.md),
buffer and cursor in [input-buffer.md](input-buffer.md), the suggestion overlay's snapshot
in [suggestion-overlay.md](suggestion-overlay.md), the turn flag and the activity verb
behind the `thinking…` label in [turn-state.md](turn-state.md), and the raw escape
sequences in [ansi.md](ansi.md).
