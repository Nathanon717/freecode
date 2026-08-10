# src/cli/render/transcript-format.ts - Transcript Formatters

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Pure transcript formatters — value in, styled string out. No stream, no
state.

## Read When

changing what a tool call line, rationale, result preview, created
file, edit diff, prompt echo or step divider *looks* like.
<!-- END GENERATED MAP INTENT -->

## Why it is separate

Split from [transcript-renderer.md](transcript-renderer.md), which owns the
turn/step state machine and the writing. Keeping these free of output is what
lets the live path, the `/renderer` demo and the post-wipe replay produce
byte-identical text from the same inputs — the replay's test asserts exactly
that.

## Key neighbors

[transcript-renderer.md](transcript-renderer.md) re-exports everything here and
is the module callers should import from.
[transcript-options.md](transcript-options.md) supplies the options types and
truncation defaults.

## Update triggers

A new transcript element that needs a look of its own, or a change to preview
truncation.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
formatArgs(args: Record<string, unknown>): string

filterArgs(name: string, args: Record<string, unknown>): Record<string, unknown>

formatRationaleLine(rationale: string): string

formatToolCallLine(name: string, args: Record<string, unknown>): string

/**
 * Like `formatToolCallLine`, prefixed with `~ `.
 */
formatParsedToolCallLine(name: string, args: Record<string, unknown>): string

/**
 * The `> ` echo of a submitted prompt. Shared by the raw-mode input UI, which
 * prints it live, and the replay, which reprints it — so the two cannot drift.
 * `eol` exists because raw mode needs an explicit carriage return (`\r\n`).
 * Continuation lines are indented two spaces.
 */
formatPromptEcho(text: string, eol?: string): string

formatToolErrorLine(name: string, err: unknown): string

/**
 * Honours `maxResultLines` and `maxResultRows`, trimming via `fitLinesToRows`
 * against the rendered (gutter + colour) width and reporting the dropped count in
 * a "… (N more lines)" footer.
 */
formatToolResultPreview(result: unknown, options?: TranscriptRenderOptions): string

/**
 * Create-file preview: the read tool's line-number gutter from line 1, so create
 * and read read alike, then dimmed and truncated like `formatToolResultPreview`.
 */
formatCreatedFileContent(content: string, options?: TranscriptRenderOptions): string

/**
 * Smart diff renderer: red/green for changed lines, dim for file context. Every
 * line carries a dim right-aligned line-number gutter starting at `startLine`
 * (removed lines keep old-file numbers, everything else new-file numbers), in the
 * same format `read`/`create` use via `util/line-numbers.ts`. Honours
 * `maxResultLines` and `maxResultRows` the same way `formatToolResultPreview`
 * does: `edit` (like `create`) previews its diff before confirmation, so a long
 * change must still fit the approval row budget or it scrolls the call line the
 * user is approving off-screen.
 */
formatEditFileDiff(_path: string, oldText: string, newText: string, contextBefore?: string[], contextAfter?: string[], options?: TranscriptRenderOptions, lineIndent?: string, startLine?: number): string

/**
 * One raw divider line, no surrounding newlines — `writeStepSeparator` in the
 * renderer owns those. Uses the target stream's column width when `options` is given.
 */
formatTranscriptStepDivider(options?: TranscriptRuntimeOptions | undefined): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-options.ts`](transcript-options.md) ×9, [`cli/render/banner.ts`](banner.md) ×5, [`util/wrap-rows.ts`](../../util/wrap-rows.md) ×2, [`util/line-diff.ts`](../../util/line-diff.md) ×1, [`util/line-numbers.ts`](../../util/line-numbers.md) ×1
- **Imported by:** [`cli/render/transcript-renderer.ts`](transcript-renderer.md) ×19

## Tests

`tests/cli/render/transcript-format.test.ts`.

## Budget

215 / 500 lines (285 to spare).

## Env

`COLUMNS`
<!-- END GENERATED MAP FACTS -->
