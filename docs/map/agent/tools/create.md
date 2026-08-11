# src/agent/tools/create.ts - create Tool

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Creates a new UTF-8 file relative to the active project root, refusing paths inside `.git`.

## Read When

- Changing how new files are created, e.g. adding a fail-if-exists check, encoding, or error handling.
- Debugging why creating a file fails, reports wrong bytes written, or is refused as a `.git` write — that guard is in [git-guard.md](git-guard.md).
- Extending file creation to support newline/tab normalization or directory auto-creation.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createFileTool: CoreTool<z.ZodObject<{ path: z.ZodString; content: z.ZodString; }, 'strip', z.ZodTypeAny, { path: string; content: string; }, { path: string; content: string; }>, string> & { execute: (args: { path: string; content: string; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/tools/git-guard.ts`](git-guard.md) ×2, [`agent/workspace.ts`](../workspace.md) ×2
- **Imported by:** [`agent/tools/index.ts`](index.md) ×1

## Tests

`tests/agent/tools/create.test.ts`. 1 other test file references it.

## Budget

34 / 500 lines (466 to spare).
<!-- END GENERATED MAP FACTS -->

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative path from project root. |
| `content` | `string` | Complete file content to write. |

## Behavior

- Resolves through `resolveProjectPath()`, rejecting absolute paths and `..` escapes outside the project root.
- Refuses outright when any path segment is `.git` — see [git-guard.md](git-guard.md).
- Creates parent directories recursively with async `mkdir(dir, { recursive: true })`.
- Normalizes double-escaped `\\n` and `\\t` sequences into real newlines/tabs.
- Writes with exclusive create mode and fails if the target file already exists.
- Returns `Wrote <n> bytes to <path>` on success.
- Returns an error string instead of throwing on failure.
