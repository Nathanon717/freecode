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

/**
 * Read an edit's surrounding-file context from disk: the unchanged lines above
 * and below the matched `old_text`, the leading indent stripped onto its own
 * line, and the 1-based line number the diff starts rendering from. Degrades to
 * empty context (startLine 1) when the file is missing or the match isn't found —
 * the diff is a projection of the intended edit, not a guarantee it will apply.
 */
computeEditDiffContext(path: unknown, oldText: unknown): EditDiffContext

/**
 * Build the `edit-diff` step result from an edit's args plus its (possibly
 * absent) disk context. Returns null when the args aren't a well-formed edit, so
 * both the pending-approval preview and the post-execution render share one shape.
 */
editDiffResult(args: Record<string, unknown>, ctx: EditDiffContext | undefined): { kind: "edit-diff"; path: string; oldText: string; newText: string; contextBefore: string[]; contextAfter: string[]; lineIndent: string; startLine: number; } | null
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-renderer.ts`](../../cli/render/transcript-renderer.md) ×1, [`config/index.ts`](../../config/index.md) ×1
- **Imported by:** [`agent/tools/wrappers.ts`](wrappers.md) ×5

## Tests

`tests/agent/tools/edit-diff-context.test.ts`.

## Budget

102 / 500 lines (398 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Facts

- `computeEditDiffContext(path, oldText)` reads the file at `join(process.cwd(), path)`, locates `oldText` (with the same `\n`/`\t`/CRLF normalisation the edit tool applies), and returns the unchanged lines above/below, the leading indent stripped onto its own line, and the 1-based `startLine` the diff renders from. It never throws — a missing file or unmatched `oldText` degrades to empty context (`startLine` 1). The context walk stops at blank lines and at `loadConfig().diffContextLines`.
- `editDiffResult(args, ctx)` builds the `edit-diff` `ToolStepResult` from the edit's args plus that (possibly absent) context, or returns `null` when the args aren't a well-formed edit (missing/typed-wrong `path`/`old_text`/`new_text`).
- The diff is a **projection** of the intended edit: it renders even when `old_text` won't match, in which case the edit tool errors on execute.

## Read When

- Changing what surrounding context an edit diff shows, or the shape of the `edit-diff` step result.

## Key Neighbors

- [index.md](index.md) — computes the context in `withToolRendering` (stashed in `PreviewState.editContext`) and renders it in `withConfirmation` (pre-approval) and post-execution.
- [../../cli/transcript-renderer.md](../../cli/render/transcript-renderer.md) — owns `ToolStepResult` and `formatEditFileDiff`, which draws the result this module builds.
