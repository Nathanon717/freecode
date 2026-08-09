# src/agent/tools/list-dir.ts - list_dir Tool

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Lists one directory relative to the active project root.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
listDirTool: CoreTool<z.ZodObject<{ path: z.ZodOptional<z.ZodString>; }, 'strip', z.ZodTypeAny, { path?: string | undefined; }, { path?: string | undefined; }>, string> & { execute: (args: { path?: string | undefined; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/workspace.ts`](../workspace.md) ×1
- **Imported by:** [`agent/tools/index.ts`](index.md) ×1

## Tests

`tests/agent/tools/list-dir.test.ts`. 1 other test file references it.

## Budget

44 / 500 lines (456 to spare).
<!-- END GENERATED MAP FACTS -->

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
