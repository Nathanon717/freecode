# src/agent/tools/edit-diff-context.ts - Edit Diff Context

**Role:** Reads an edit's surrounding-file context from disk and shapes the `edit-diff` step result, so both the pending-approval preview and the post-execution render draw the same diff from a single disk read.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface EditDiffContext {
  contextBefore: string[];
  contextAfter: string[];
  lineIndent: string;
  startLine: number;
}

computeEditDiffContext(path: unknown, oldText: unknown): EditDiffContext

editDiffResult(args: Record<string, unknown>, ctx: EditDiffContext | undefined): { kind: "edit-diff"; path: string; oldText: string; newText: string; contextBefore: string[]; contextAfter: string[]; lineIndent: string; startLine: number; } | null
```
<!-- END GENERATED EXPORTS -->

## Key Facts

- `computeEditDiffContext(path, oldText)` reads the file at `join(process.cwd(), path)`, locates `oldText` (with the same `\n`/`\t`/CRLF normalisation the edit tool applies), and returns the unchanged lines above/below, the leading indent stripped onto its own line, and the 1-based `startLine` the diff renders from. It never throws — a missing file or unmatched `oldText` degrades to empty context (`startLine` 1). The context walk stops at blank lines and at `loadConfig().diffContextLines`.
- `editDiffResult(args, ctx)` builds the `edit-diff` `ToolStepResult` from the edit's args plus that (possibly absent) context, or returns `null` when the args aren't a well-formed edit (missing/typed-wrong `path`/`old_text`/`new_text`).
- The diff is a **projection** of the intended edit: it renders even when `old_text` won't match, in which case the edit tool errors on execute.

## Read When

- Changing what surrounding context an edit diff shows, or the shape of the `edit-diff` step result.

## Key Neighbors

- [index.md](index.md) — computes the context in `withToolRendering` (stashed in `PreviewState.editContext`) and renders it in `withConfirmation` (pre-approval) and post-execution.
- [../../cli/transcript-renderer.md](../../cli/transcript-renderer.md) — owns `ToolStepResult` and `formatEditFileDiff`, which draws the result this module builds.
