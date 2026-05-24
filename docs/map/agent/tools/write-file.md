# src/agent/tools/write-file.ts - write_file Tool

**Role:** Creates a new UTF-8 file relative to the active project root.

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
- Writes with exclusive create mode and fails if the target file already exists.
- Returns `Wrote <n> bytes to <path>` on success.
- Returns an error string instead of throwing on failure.
