
0I[HT6R9GOPT[Fepw}
=   `]2ZW13OP# src/agent/tools/edit-file.ts - edit_file Tool

**Role:** Applies one exact text replacement inside an existing UTF-8 file relative to the active project root.

## Export

```typescript
editFileTool: CoreTool
```

## Parameters

| Param | Type | Description |
|-------|------|-------------|
| `path` | `string` | Relative path from project root. |
| `old_text` | `string` | Exact text to replace; must appear exactly once. |
| `new_text` | `string` | Replacement text. |

## Behavior

- Resolves through `resolveProjectPath()`, rejecting absolute paths and `..` escapes outside the project root.
- Requires the normalized relative path to have been successfully read with `read_file` first.
- Normalizes double-escaped `\\n` and `\\t` sequences in `old_text` and `new_text`.
- Rejects empty, missing, or ambiguous `old_text`.
- Writes the updated file as UTF-8 while preserving the original LF vs CRLF line ending style.
- Returns `Edited <path>: replaced <old> bytes with <new> bytes` on success.
- Returns an error string instead of throwing on failure.
