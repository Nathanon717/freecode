# src/agent/tools/read-file.ts - read_file Tool

**Role:** Reads a UTF-8 file relative to the active project root.

## Export

```typescript
readFileTool: CoreTool
```

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative path from project root. |

## Behavior

- Resolves with `join(projectRoot, path)`.
- Reads using UTF-8.
- Marks the relative path as read after a successful filesystem read so `edit_file` may edit it later.
- Returns file content directly when length is at most 30,000 characters.
- Returns the first 30,000 characters plus a truncation note for larger files.
- Returns an error string instead of throwing when the file cannot be read.
