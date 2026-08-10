# src/logger.ts - Logging Utility

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Category-colored stderr logging. Diagnostic logging is disabled by default; errors always surface.

## Read When

- Adding or renaming a log category color in CATEGORY_COLORS.
- Changing the stderr output format, timestamp, or JSON data serialization.
- Debugging why `-log` flag output is missing, since enableLog() gates every write.
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
 * Always writes to stderr regardless of `enableLog` state, with the error text and stack.
 */
logError(category: string, message: string, err: unknown): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/command-dispatcher.ts`](cli/command-dispatcher.md) ×21, [`store/db.ts`](store/db.md) ×17, [`agent/loop.ts`](agent/loop.md) ×10, [`agent/parsed-tools.ts`](agent/parsed-tools.md) ×5, [`agent/usage-finalize.ts`](agent/usage-finalize.md) ×3, [`eval/result-sink.ts`](eval/result-sink.md) ×3, [`eval/runner.ts`](eval/runner.md) ×3, [`agent/tools/wrappers.ts`](agent/tools/wrappers.md) ×2, +7 more

## Tests

`tests/logger.test.ts`. 3 other test files reference it.

## Budget

54 / 500 lines (446 to spare).
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
