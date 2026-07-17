# src/util/screen-buffer.ts - Screen Buffer

**Role:** Intercepts `process.stdout.write` at startup to maintain rolling buffers of recent terminal output. Keeps a plain (ANSI-stripped) buffer for text search and a parallel styled buffer (ANSI codes preserved) for overlay repaints. Used by the bottom TUI to repaint rows after temporary overlays.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
stripAnsi(str: string): string

installScreenBuffer(): void

startOverlayEpoch(): void

getScreenBufferDisplayLinesForOverlay(count: number, _scrollHeight: number): string[]
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `installScreenBuffer` — call once at process startup (`index.ts`); no-op if already installed.
- `startOverlayEpoch` — marks the current write position as the start of the scroll-region epoch; lines before it (banner/chrome) are excluded from overlay repaints. Called after **every** banner (re)draw in `banner.ts`, not just startup, so mid-session banner reprints (/clear, /model, /config, /eval, resize) don't leak into overlay repaints.
- A write containing a full-screen / scrollback erase (`\x1b[…J`, e.g. the `\x1b[2J` in `clearEntireTerminal`/`clearAndRedrawBanner`) resets the buffer and the epoch, since nothing previously on screen can sit behind an overlay anymore. Line erase (`\x1b[2K`) does not trigger this.
- `getScreenBufferDisplayLinesForOverlay` — returns styled lines (ANSI codes intact) needed to repaint `count` overlay rows after a suggestion list closes. Accounts for freecode's cursor-at-bottom-of-scroll-region output model: the bottom overlay row is always blank, the preceding `count-1` rows hold the last epoch lines, top-padded with blanks.

## Key neighbors

- Called from `src/index.ts` at startup.
- Read by `src/cli/bottom-ui.ts` when slash-command suggestions temporarily cover transcript rows.
- `startOverlayEpoch` is called by `src/cli/banner.ts` after each banner draw.

## Update triggers

Update this page if MAX_LINES changes, if the ANSI/control-sequence filtering changes, if the epoch or overlay model changes, or if new consumers read the buffer.
