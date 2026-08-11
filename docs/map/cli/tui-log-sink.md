# src/cli/tui-log-sink.ts — TUI Log Sink

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Log sink that writes diagnostic lines into the scroll region instead of wherever the cursor is parked, so background logging cannot paint over the bottom UI.

## Read When

- A log line appears mid-screen, on top of the input frame or footer separator.
- Changing where background diagnostics land relative to the transcript.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Builds the sink registered by the interactive entrypoint.
 *
 * With no footer up (headless, `-p`, piped output) this is plain stderr, unchanged. With the
 * footer up the cursor is parked at the typing position inside the input frame, so a raw
 * write would overwrite the frame and the separator row: park at the bottom of the scroll
 * region first, so the line scrolls the transcript exactly like ordinary output, then repaint
 * the chrome to put the cursor back. Output goes to stdout in that case because only stdout
 * is recorded by the screen buffer, and a line living in the scroll region has to survive a
 * resize repaint like the rest of the transcript.
 *
 * Raw mode leaves `\n` as a bare line feed, so multi-line payloads (stack traces) need CRLF
 * or every line after the first starts at the column the previous one ended on.
 *
 * The repaint is skipped while the footer timer is suspended, for the reason the timer
 * itself skips: a raw picker or the approval prompt is managing those rows by hand, and
 * `drawFooter` would clobber what it drew there. `/model` makes that overlap the common
 * case rather than a corner one — opening the picker is what fetches the model lists, so
 * the registry's own log is likeliest to arrive with the picker up.
 */
createTuiLogSink(): LogSink
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/chrome/bottom-ui.ts`](chrome/bottom-ui.md) ×6, [`logger.ts`](../logger.md) ×1

## Tests

`tests/cli/tui-log-sink.test.ts`.

## Budget

43 / 500 lines (457 to spare).
<!-- END GENERATED MAP FACTS -->

## Why It Exists

Background work logs at moments no one chose: the startup model prefetch, DB persists,
retry banners. With the bottom UI up, the cursor is parked at the typing caret inside the
input frame, so a raw stderr write starts painting *there* — over the frame and its
dividers. See `docs/bug log/11-08-2026d.md`.

The fix is the same shape as the retry-banner and quota sinks registered beside it in
`src/index.ts`: the entrypoint hands `registerLogSink` a TTY-aware writer, so
[logger.md](../logger.md) never imports chrome and non-TTY callers keep plain stderr.

## Behavior

| Footer state | Where the line goes |
| --- | --- |
| not active (headless, `-p`, piped) | `process.stderr`, byte-for-byte unchanged |
| active | scroll region via stdout, then the chrome repaints |
| active, timer suspended | scroll region via stdout; no repaint — a picker owns those rows |

Two details the tests pin: the write goes to **stdout** when the footer is up, because only
stdout is recorded by the screen buffer and a line in the scroll region has to survive a
resize repaint like the rest of the transcript; and `\n` becomes `\r\n`, because raw mode
leaves a bare line feed at the column the previous line ended on.
