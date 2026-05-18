# src/logger.ts - Logging Utility

**Role:** Category-colored stderr logging. Logging is disabled by default and enabled for the process with `enableLog()`.

## Exports

| Symbol | Signature | Description |
|--------|-----------|-------------|
| `enableLog` | `() => void` | Enables logging for the process lifetime. |
| `log` | `(category: string, message: string, data?: unknown) => void` | Emits one timestamped log line when enabled. |
| `logError` | `(category: string, message: string, err: unknown) => void` | Formats an error and sends it through the `error` category. |

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
