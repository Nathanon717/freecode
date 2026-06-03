# src/util/screen-buffer.ts - Screen Buffer

**Role:** Intercepts `process.stdout.write` at startup to maintain a rolling ring buffer of recent terminal output (stripped of ANSI escape sequences). Used by `/claude` to capture visible screen state for diagnosis.

## Exports

| Symbol | Description |
|--------|-------------|
| `installScreenBuffer` | Installs the stdout interceptor. Call once at process startup (index.ts). No-op if already installed. |
| `getScreenBuffer` | Returns the last ≤150 non-empty lines of stdout as a newline-joined string. |

## Key neighbors

- Called from `src/index.ts` at startup.
- Read by `src/commands/claude-help.ts` when `/claude` is invoked.

## Update triggers

Update this page if MAX_LINES changes, if the ANSI stripping regex is broadened, or if new consumers read the buffer.
