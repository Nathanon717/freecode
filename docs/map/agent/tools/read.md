# src/agent/tools/read.ts - read Tool

**Role:** Reads a UTF-8 file relative to the active project root, with line-based pagination and fuzzy "did you mean" suggestions on ENOENT.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
readFileTool: CoreTool<z.ZodObject<{ path: z.ZodString; offset: z.ZodOptional<z.ZodNumber>; limit: z.ZodOptional<z.ZodNumber>; }, 'strip', z.ZodTypeAny, { path: string; offset?: number | undefined; limit?: number | undefined; }, { path: string; offset?: number | undefined; limit?: number | undefined; }>, string> & { execute: (args: { path: string; offset?: number | undefined; limit?: number | undefined; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | `string` | — | Relative path from project root. |
| `offset` | `number` (int, ≥1) | `1` | 1-indexed line number to start reading from. |
| `limit` | `number` (int, ≥1) | `2000` | Maximum number of lines to return. |

## Behavior

- Resolves through `resolveProjectPath()`, rejecting absolute paths and `..` escapes outside the project root.
- Reads using UTF-8.
- Marks the relative path as read after a successful filesystem read so `edit` may edit it later.
- Output lines are prefixed with their 1-indexed line number: `N: <content>`.
- Appends a pagination footer:
  - If more lines remain: `(Showing lines M-N of T. Use offset=N+1 to continue.)`
  - If at end of file: `(End of file — total T lines.)`
- On `ENOENT`, lists up to 3 sibling entries whose name overlaps the requested basename as "Did you mean?" suggestions before falling back to a plain "File not found" message.
- Returns an error string instead of throwing for other read failures.
