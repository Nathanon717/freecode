# src/agent/tools/list-dir.ts - list_dir Tool

**Role:** Lists one directory relative to the active project root.

## Export

```typescript
listDirTool: CoreTool
```

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | `string` | `.` | Relative path from project root. |

## Behavior

- Resolves through `resolveProjectPath()`, rejecting absolute paths and `..` escapes outside the project root.
- Reads one directory level with `readdir()`.
- Calls `stat()` for each entry.
- Directories are listed first with a trailing `/`.
- Files are listed after directories.
- Directories and files are each sorted alphabetically.
- Returns an error string instead of throwing when the directory cannot be read.
