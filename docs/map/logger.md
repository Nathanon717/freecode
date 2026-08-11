# src/logger.ts - Logging Utility

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Category-colored diagnostic logging, to stderr by default or to whatever sink the entrypoint registers. Diagnostic logging is off by default; warnings and errors surface unless FREECODE_SILENCE_ERRORS is set.

## Read When

- Adding or renaming a category color in CATEGORY_COLORS, or changing the line format, timestamp, or JSON data serialization.
- Debugging missing output: enableLog() gates log() but never logError()/logWarn(), whose only gate is FREECODE_SILENCE_ERRORS — set for the unit suite, so expected-error noise stays out of the reporter.
- Chasing log lines that land on top of the TUI: every write goes through the registered sink (see `cli/tui-log-sink.ts`), and falls back to raw stderr only when none is registered.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Receives one fully-formatted, newline-terminated line.
 */
type LogSink = (line: string) => void;

/**
 * Redirects every log line to `fn` instead of raw stderr; pass null to restore stderr.
 *
 * Background work logs at arbitrary moments — DB persists, model prefetch, retries — and
 * a raw stderr write lands wherever the cursor happens to be parked, which mid-session is
 * inside the bottom UI's input frame. The interactive entrypoint registers a sink that
 * writes into the scroll region instead.
 */
registerLogSink(fn: LogSink | null): void

enableLog(): void

/**
 * Emits only after `enableLog()` (the `-log` startup flag); a no-op otherwise.
 */
log(category: string, message: string, data?: unknown): void

/**
 * Emits regardless of `enableLog` state, with the error text and stack.
 *
 * Silent only when `FREECODE_SILENCE_ERRORS` is set, which the unit suite does: dozens of
 * tests drive error paths on purpose, and those writes land on the real stderr rather than
 * vitest's captured one, shredding the dot reporter. Read at call time so a test can delete
 * the variable and exercise the write path.
 */
logError(category: string, message: string, err: unknown): void

/**
 * A handled fallback, not a failure: same always-on gating as `logError`, but one line and
 * no stack. Use it where the catch already has a working answer and the throw site is our
 * own code, so the stack says nothing the message doesn't — a dumped trace there is pure
 * noise, and mid-session it is noise measured in screenfuls.
 */
logWarn(category: string, message: string, err: unknown): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/command-dispatcher.ts`](cli/command-dispatcher.md) ×21, [`store/db.ts`](store/db.md) ×13, [`agent/loop.ts`](agent/loop.md) ×10, [`agent/parsed-tools.ts`](agent/parsed-tools.md) ×5, [`agent/usage-finalize.ts`](agent/usage-finalize.md) ×3, [`eval/result-sink.ts`](eval/result-sink.md) ×3, [`eval/runner.ts`](eval/runner.md) ×3, [`agent/tools/wrappers.ts`](agent/tools/wrappers.md) ×2, +10 more

## Tests

`tests/logger.test.ts`. 3 other test files reference it.

## Budget

94 / 500 lines (406 to spare).

## Env

`FREECODE_SILENCE_ERRORS`
<!-- END GENERATED MAP FACTS -->

## Category Colors

| Category | Color |
|----------|-------|
| `config` | yellow |
| `ollama` | magenta |
| `router` | cyan |
| `stream` | blue |
| `tool` | green |
| `db` | gray |
| `quota` | yellow |
| `error` | red |

Unknown categories default to white.

## Format

```text
[HH:MM:SS.mmm] [category] message  <optional JSON data>
[HH:MM:SS.mmm] [warn]  [category] message: error text
[HH:MM:SS.mmm] [error] [category] message: error text
                                           <stack, logError only>
```

`logWarn` is the handled-fallback level: same always-on gating as `logError`, one line, no
stack. Use it where the catch already has a working answer and the throw came from our own
code, so the trace adds nothing.

## Where Output Goes

Nothing here writes to a stream directly. Every line goes through the sink registered by
`registerLogSink`, which defaults to stderr so diagnostics never pollute stdout scripts.
The interactive entrypoint swaps in [cli/tui-log-sink.md](cli/tui-log-sink.md), because
background logging fires at moments when the cursor is parked inside the bottom UI and a
raw stderr write paints straight over the input frame.
