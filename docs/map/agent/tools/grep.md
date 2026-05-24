# src/agent/tools/grep.ts - grep Tool

**Role:** Searches files using ripgrep (`rg`) when available, falling back to Windows `findstr`. Results are sorted by file modification time (newest first) so recently-changed code surfaces first.

## Export

```typescript
grepTool: CoreTool
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pattern` | `string` | required | Regex pattern to search for. |
| `path` | `string` | `.` | Directory resolved against `projectRoot` and used as the search root. |
| `include` | `string` | — | Optional glob filter passed to rg `--glob` (e.g. `"*.ts"`). Ignored in findstr fallback. |

## Behavior

- Detects `rg` availability once at module load (cached promise, no per-call cost).
- **rg path:** `rg -n --no-heading --hidden --glob=!.git/* [--glob=<include>] -- <pattern> .`
  - Stats unique result files concurrently for `mtime`.
  - Sorts all matches descending by `mtime` (newest files first).
  - Truncates to 100 results with a count header and a truncation notice.
- **findstr fallback:** `findstr /s /n /i "<pattern>" *` limited to 50 lines. `include` is silently ignored.
- Returns a plain string with header `Found N matches [...]`, grouped by file, or `No matches found`.

## Notes

The `include` glob is only effective when `rg` is available. Pattern is passed as a positional argument after `--` to avoid shell-quoting issues; `execFile` is used (not `exec`) to prevent injection.
