# src/cli/render/transcript-format.ts - Transcript Formatters

**Role:** Pure transcript formatters — value in, styled string out. No stream, no
state.

**Read when:** changing what a tool call line, rationale, result preview, created
file, edit diff, prompt echo or step divider *looks* like.

## Why it is separate

Split from [transcript-renderer.md](transcript-renderer.md), which owns the
turn/step state machine and the writing. Keeping these free of output is what
lets the live path, the `/renderer` demo and the post-wipe replay produce
byte-identical text from the same inputs — the replay's test asserts exactly
that.

## Export notes

- `formatEditFileDiff()` — smart diff renderer; red/green for changed lines, dim
  for file context. Prefixes every line with a dim right-aligned line-number
  gutter (removed lines keep old-file numbers, everything else new-file numbers),
  starting at `startLine`; same gutter format as `read`/`create` (via
  [../../util/line-numbers.md](../../util/line-numbers.md)).
- `formatCreatedFileContent()` — create-file preview; numbers content from line 1
  with the shared gutter, then dims/truncates like `formatToolResultPreview`.
- `formatParsedToolCallLine()` — like `formatToolCallLine` but prefixes `~ `.
- `formatPromptEcho(text, eol?)` — the `> ` echo of a submitted prompt, with
  continuation lines indented two spaces. Shared by `cli/session-modes.ts`, which
  prints it live in raw mode (hence the `eol` parameter, which needs `\r\n`), and
  [transcript-replay.md](transcript-replay.md), which reprints it — so the two
  cannot drift.
- `formatTranscriptStepDivider(options?)` — returns one raw divider line (no
  newlines); uses the target stream's column width when `options` is provided.
  `writeStepSeparator` in the renderer owns the surrounding blank lines.
- `formatToolResultPreview()` / `formatEditFileDiff()` both honour
  `maxResultLines` and `maxResultRows`, trimming via `fitLinesToRows` against the
  rendered (gutter + colour) width and reporting the dropped count in a
  "… (N more lines)" footer.

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

formatParsedToolCallLine(name: string, args: Record<string, unknown>): string

formatPromptEcho(text: string, eol?: string): string

formatToolErrorLine(name: string, err: unknown): string

formatToolResultPreview(result: unknown, options?: TranscriptRenderOptions): string

formatCreatedFileContent(content: string, options?: TranscriptRenderOptions): string

formatEditFileDiff(_path: string, oldText: string, newText: string, contextBefore?: string[], contextAfter?: string[], options?: TranscriptRenderOptions, lineIndent?: string, startLine?: number): string

formatTranscriptStepDivider(options?: TranscriptRuntimeOptions | undefined): string
```
<!-- END GENERATED EXPORTS -->
