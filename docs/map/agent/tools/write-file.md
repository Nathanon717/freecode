# src/agent/tools/write-file.ts - write_file Tool

**Role:** Creates or overwrites a UTF-8 file relative to the active project root.

## Export

```typescript
writeFileTool: CoreTool
```

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative path from project root. |
| `content` | `string` | Complete file content to write. |

## Behavior

- Resolves with `join(projectRoot, path)`.
- Creates parent directories recursively with async `mkdir(dir, { recursive: true })`.
- Normalizes double-escaped `\\n` and `\\t` sequences into real newlines/tabs.
- Overwrites the target file with UTF-8 content.
- Returns `Wrote <n> bytes to <path>` on success.
- Returns an error string instead of throwing on failure.
