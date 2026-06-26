# src/agent/tools/edit.ts - edit Tool

**Role:** Applies one exact text replacement inside an existing UTF-8 file relative to the active project root.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
editTool: CoreTool<z.ZodObject<{ path: z.ZodString; old_text: z.ZodString; new_text: z.ZodString; }, 'strip', z.ZodTypeAny, { path: string; old_text: string; new_text: string; }, { path: string; old_text: string; new_text: string; }>, string> & { execute: (args: { path: string; old_text: string; new_text: string; }, options: { abortSignal?: AbortSignal; }) => PromiseLike<string>; }
```
<!-- END GENERATED EXPORTS -->

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative path from project root. |
| `old_text` | `string` | Exact text to replace; must appear exactly once. |
| `new_text` | `string` | Replacement text. |

## Behavior

- Resolves through `resolveProjectPath()`, rejecting absolute paths and `..` escapes outside the project root.
- Requires the normalized relative path to have been successfully read with `read` first.
- Normalizes double-escaped `\\n` and `\\t` sequences in `old_text` and `new_text`.
- Rejects empty, missing, or ambiguous `old_text`.
- Writes the updated file as UTF-8 while preserving the original LF vs CRLF line ending style.
- Returns `Edited <path>: replaced <old> bytes with <new> bytes` on success.
- Returns an error string instead of throwing on failure.
