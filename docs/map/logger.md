# src/logger.ts - Logging Utility

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Category-colored stderr logging. Diagnostic logging is disabled by default; errors surface unless FREECODE_SILENCE_ERRORS is set.

## Read When

- Adding or renaming a log category color in CATEGORY_COLORS.
- Changing the stderr output format, timestamp, or JSON data serialization.
- Debugging missing output: enableLog() gates log() but never logError(), whose only gate is FREECODE_SILENCE_ERRORS — set for the unit suite, so expected-error noise stays out of the reporter.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
enableLog(): void

/**
 * Emits only after `enableLog()` (the `-log` startup flag); a no-op otherwise.
 */
log(category: string, message: string, data?: unknown): void

/**
 * Writes to stderr regardless of `enableLog` state, with the error text and stack.
 *
 * Silent only when `FREECODE_SILENCE_ERRORS` is set, which the unit suite does: dozens of
 * tests drive error paths on purpose, and those writes land on the real stderr rather than
 * vitest's captured one, shredding the dot reporter. Read at call time so a test can delete
 * the variable and exercise the write path.
 */
logError(category: string, message: string, err: unknown): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/command-dispatcher.ts`](cli/command-dispatcher.md) ×21, [`store/db.ts`](store/db.md) ×13, [`agent/loop.ts`](agent/loop.md) ×10, [`agent/parsed-tools.ts`](agent/parsed-tools.md) ×5, [`agent/usage-finalize.ts`](agent/usage-finalize.md) ×3, [`eval/result-sink.ts`](eval/result-sink.md) ×3, [`eval/runner.ts`](eval/runner.md) ×3, [`agent/tools/wrappers.ts`](agent/tools/wrappers.md) ×2, +7 more

## Tests

`tests/logger.test.ts`. 3 other test files reference it.

## Budget

61 / 500 lines (439 to spare).

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
```

All output goes to stderr so diagnostics do not pollute stdout scripts.
