# src/logger.ts - Logging Utility

**Role:** Category-colored stderr logging. Diagnostic logging is disabled by default; errors always surface.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `enableLog` | `() => void` | Enables diagnostic logging for the process lifetime. |
| `log` | `(category: string, message: string, data?: unknown) => void` | Emits one timestamped log line — only when `enableLog()` has been called (`-log` flag). |
| `logError` | `(category: string, message: string, err: unknown) => void` | Always writes to stderr regardless of `enableLog` state. Includes message, error text, and stack trace. |

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
