# src/util/screen-buffer.ts - Screen Buffer

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Intercepts `process.stdout.write` at startup to maintain rolling buffers of recent terminal output. Keeps a plain (ANSI-stripped) buffer for text search and a parallel styled buffer (ANSI codes preserved) for overlay repaints. Used by the bottom TUI to repaint rows after temporary overlays.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
stripAnsi(str: string): string

/**
 * Writes bytes that are chrome, not transcript, so the buffer never records them.
 * The capture filter normally recognises chrome by its cursor/screen escapes, but a
 * write can be pure layout and still carry none — e.g. the bare newlines that open
 * rows for the input frame. Recorded, those would surface as phantom blank lines in
 * overlay repaints and resize scrubs, and would make hasPostEpochContent() claim a
 * transcript exists on a fresh screen.
 */
writeChrome(chunk: string): void

/**
 * Call once at process startup (`index.ts`); a no-op if already installed.
 *
 * A write carrying a full-screen or scrollback erase (`\x1b[…J`, e.g. the
 * `\x1b[2J` in `clearEntireTerminal` / `clearAndRedrawBanner`) resets the buffer
 * and the epoch, since nothing previously on screen can sit behind an overlay any
 * more. A line erase (`\x1b[2K`) does not.
 */
installScreenBuffer(): void

/**
 * Records the current write position as the start of the scroll-region epoch.
 * Lines before this index (the banner and other chrome) are excluded from
 * overlay repaints. Call it right after every banner (re)draw so the freshly
 * printed banner is treated as chrome — not just once at startup, since
 * /clear, /model, /config, /eval and resize all reprint the banner mid-session
 * and their banner lines would otherwise leak into overlay repaints. Do NOT
 * call it from per-turn input reinit that isn't preceded by a screen clear, or
 * it would discard transcript lines the user can still see.
 */
startOverlayEpoch(): void

/**
 * Whether any transcript has been printed since the current overlay epoch. False
 * on a fresh/startup screen (only the banner and pre-input chrome are on screen);
 * true once real conversation output exists. The resize handler uses this to tell
 * "the banner is what's showing" (redraw it responsively) from "a transcript is
 * showing" (let the terminal reflow it, don't wipe to the banner).
 */
hasPostEpochContent(): boolean

wrapStyledToRows(styled: string, width: number): string[]

/**
 * Returns the last `rowCount` post-epoch transcript display lines (styled, ANSI
 * intact), top-padded with blanks when fewer exist. When `width` is given, over-
 * wide logical lines are wrapped into multiple display rows first, so the result
 * is exactly what those rows occupy on screen. Used to repaint the scroll region
 * on resize: the terminal reflows cursor-addressed chrome (the input frame, and a
 * suggestion overlay) into the transcript as stale duplicates, and the buffer
 * holds only the clean transcript, so repainting from it erases them.
 */
getScreenBufferScrollRegionLines(rowCount: number, width?: number | undefined): string[]

composeScrollRegionScrub(rowCount: number, width: number): string

/**
 * Returns the lines that should repaint the n overlay rows when a suggestion
 * list closes.  freecode parks the cursor at the bottom of the scroll region
 * before writing output, so each newline scrolls content upward and the
 * bottom row is always blank after printing.  The preceding count-1 rows hold
 * the last min(L, count-1) lines of scroll-region output, with blank padding
 * at the top when L < count-1.  Lines are returned with their original ANSI
 * color codes intact so the restore does not bleach content.
 */
getScreenBufferDisplayLinesForOverlay(count: number, _scrollHeight: number): string[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/chrome/bottom-ui.ts`](../cli/chrome/bottom-ui.md) ×5, [`cli/render/banner.ts`](../cli/render/banner.md) ×3, [`cli/chrome/suggestion-overlay.ts`](../cli/chrome/suggestion-overlay.md) ×2, [`util/wrap-rows.ts`](wrap-rows.md) ×1

## Tests

`tests/util/screen-buffer.test.ts`. 2 other test files reference it.

## Budget

210 / 500 lines (290 to spare).
<!-- END GENERATED MAP FACTS -->

## Key neighbors

- Called from `src/index.ts` at startup.
- Read by `src/cli/chrome/bottom-ui.ts` when slash-command suggestions temporarily cover transcript rows.
- `startOverlayEpoch` is called by `src/cli/render/banner.ts` after each banner draw.

## Update triggers

Update this page if MAX_LINES changes, if the ANSI/control-sequence filtering changes, if the epoch or overlay model changes, or if new consumers read the buffer.
