# src/agent/tools/grep.ts - grep Tool

**Role:** Searches files from a relative directory using Windows `findstr`.

## Export

```typescript
grepTool: CoreTool
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pattern` | `string` | required | Pattern passed to `findstr`. Double quotes are escaped. |
| `path` | `string` | `.` | Directory resolved against `projectRoot` and used as command CWD. |

## Behavior

- Resolves the search CWD with `resolve(projectRoot, path)`.
- Runs `findstr /s /n /i "<pattern>" *`.
- Limits non-empty output lines to the first 50.
- Treats common no-match failures as `No matches found`.
- Returns an error string for other execution failures.

## Notes

`findstr` syntax is Windows-specific and not POSIX-compatible. The tool is intentionally simple; complex searches can be done through `shell_exec`.
