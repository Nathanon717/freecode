# src/util/screen-buffer.ts - Screen Buffer

**Role:** Intercepts `process.stdout.write` at startup to maintain rolling buffers of recent terminal output. Keeps a plain (ANSI-stripped) buffer for text search and a parallel styled buffer (ANSI codes preserved) for overlay repaints. Used by the bottom TUI to repaint rows after temporary overlays.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
stripAnsi(str: string): string

installScreenBuffer(): void

startOverlayEpoch(): void

hasPostEpochContent(): boolean

getScreenBufferScrollRegionLines(rowCount: number): string[]

composeScrollRegionScrub(rowCount: number, width: number): string

getScreenBufferDisplayLinesForOverlay(count: number, _scrollHeight: number): string[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `installScreenBuffer` — call once at process startup (`index.ts`); no-op if already installed.
- `startOverlayEpoch` — marks the current write position as the start of the scroll-region epoch; lines before it (banner/chrome) are excluded from overlay repaints. Called after **every** banner (re)draw in `banner.ts`, not just startup, so mid-session banner reprints (/clear, /model, /config, /eval) don't leak into overlay repaints.
- `hasPostEpochContent` — whether any transcript has been printed since the current epoch. False on a fresh/startup screen (only banner + pre-input chrome), true once real output exists. The `bottom-ui.ts` resize handler branches on it: banner-only → redraw the banner responsively; transcript present → let the terminal reflow it (don't wipe).
- A write containing a full-screen / scrollback erase (`\x1b[…J`, e.g. the `\x1b[2J` in `clearEntireTerminal`/`clearAndRedrawBanner`) resets the buffer and the epoch, since nothing previously on screen can sit behind an overlay anymore. Line erase (`\x1b[2K`) does not trigger this.
- `getScreenBufferDisplayLinesForOverlay` — returns styled lines (ANSI codes intact) needed to repaint `count` overlay rows after a suggestion list closes. Accounts for freecode's cursor-at-bottom-of-scroll-region output model: the bottom overlay row is always blank, the preceding `count-1` rows hold the last epoch lines, top-padded with blanks.
- `getScreenBufferScrollRegionLines` — returns the last `rowCount` post-epoch transcript lines (styled), top-padded with blanks. The resize handler in `bottom-ui.ts` uses it to repaint the whole scroll region when a suggestion overlay was open, scrubbing the stale duplicate rows the terminal reflows in from the overlay's cursor-addressed writes.

## Key neighbors

- Called from `src/index.ts` at startup.
- Read by `src/cli/chrome/bottom-ui.ts` when slash-command suggestions temporarily cover transcript rows.
- `startOverlayEpoch` is called by `src/cli/render/banner.ts` after each banner draw.

## Update triggers

Update this page if MAX_LINES changes, if the ANSI/control-sequence filtering changes, if the epoch or overlay model changes, or if new consumers read the buffer.
