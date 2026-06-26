# src/logger.ts - Logging Utility

**Role:** Category-colored stderr logging. Diagnostic logging is disabled by default; errors always surface.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
enableLog(): void

log(category: string, message: string, data?: unknown): void

logError(category: string, message: string, err: unknown): void
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `log`: Only emits when `enableLog()` has been called (`-log` flag at startup); no-op otherwise.
- `logError`: Always writes to stderr regardless of `enableLog` state; includes the error text and stack trace.

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
