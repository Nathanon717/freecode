# src/util/screen-buffer.ts - Screen Buffer

**Role:** Intercepts `process.stdout.write` at startup to maintain rolling buffers of recent terminal output. Keeps a plain (ANSI-stripped) buffer for text search and a parallel styled buffer (ANSI codes preserved) for overlay repaints. Used by the bottom TUI to repaint rows after temporary overlays.

## Exports

| Symbol | Description |
|--------|-------------|
| `installScreenBuffer` | Installs the stdout interceptor. Call once at process startup (index.ts). No-op if already installed. |
| `getScreenBuffer` | Returns the last <=150 non-empty transcript lines as a newline-joined string. |
| `getScreenBufferDisplayLines` | Returns recent plain transcript lines, including intentional blank lines. |
| `startOverlayEpoch` | Marks the current write position as the start of the scroll-region epoch. Call once on first `setupInputUI` to exclude pre-UI output (startup banner) from overlay repaints. |
| `getScreenBufferDisplayLinesForOverlay` | Returns the styled lines (ANSI codes intact) needed to repaint `count` overlay rows after a suggestion list closes. Accounts for freecode's cursor-at-bottom-of-scroll-region output model: the bottom overlay row is always blank, the preceding `count-1` rows hold the last epoch lines, top-padded with blanks. |

## Key neighbors

- Called from `src/index.ts` at startup.
- Read by `src/cli/terminal-ui.ts` when slash-command suggestions temporarily cover transcript rows.

## Update triggers

Update this page if MAX_LINES changes, if the ANSI/control-sequence filtering changes, if the epoch or overlay model changes, or if new consumers read the buffer.
