# src/agent/tools/create.ts - create Tool

**Role:** Creates a new UTF-8 file relative to the active project root.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createTool: CoreTool<z.ZodObject<{ path: z.ZodString; content: z.ZodString; }, 'strip', z.ZodTypeAny, { path: string; content: string; }, { path: string; content: string; }>, string> & { execute: (args: { path: string; content: string; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative path from project root. |
| `content` | `string` | Complete file content to write. |

## Behavior

- Resolves through `resolveProjectPath()`, rejecting absolute paths and `..` escapes outside the project root.
- Creates parent directories recursively with async `mkdir(dir, { recursive: true })`.
- Normalizes double-escaped `\\n` and `\\t` sequences into real newlines/tabs.
- Writes with exclusive create mode and fails if the target file already exists.
- Returns `Wrote <n> bytes to <path>` on success.
- Returns an error string instead of throwing on failure.
