# src/cli/transcript-renderer.ts - Agent Transcript Formatting

**Role:** Shared formatting and normalisation for all visible agent transcript output. The state machine here is the single authority for turn layout — every path through `agentLoop` and `runParsedToolsLoop` delegates spacing decisions to these functions so that model-specific differences in whitespace are absorbed here and can never leak into the displayed transcript.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export type { DiffEntry } from "../util/line-diff.js"

export {
  DEFAULT_TRANSCRIPT_MAX_RESULT_LINES,
  TRANSCRIPT_DIVIDER_WIDTH,
  getTranscriptRuntimeOptions,
  getTranscriptStream,
} from "./transcript-options.js"

export type {
  TranscriptStreamName,
  TranscriptRenderOptions,
  TranscriptRuntimeOptions,
} from "./transcript-options.js"

formatArgs(args: Record<string, unknown>): string

filterArgs(name: string, args: Record<string, unknown>): Record<string, unknown>

formatRationaleLine(rationale: string): string

formatToolCallLine(name: string, args: Record<string, unknown>): string

formatParsedToolCallLine(name: string, args: Record<string, unknown>): string

formatToolErrorLine(name: string, err: unknown): string

formatToolResultPreview(result: unknown, options?: TranscriptRenderOptions): string

formatCreatedFileContent(content: string, options?: TranscriptRenderOptions): string

formatEditFileDiff(_path: string, oldText: string, newText: string, contextBefore?: string[], contextAfter?: string[], options?: TranscriptRenderOptions, lineIndent?: string, startLine?: number): string

formatTranscriptStepDivider(options?: TranscriptRuntimeOptions | undefined): string

writeStepSeparator(options?: TranscriptRuntimeOptions): void

beginTranscriptTurn(options?: TranscriptRuntimeOptions): void

notifyTranscriptChunk(chunk: string): void

writeTranscriptToolLeadIn(options?: TranscriptRuntimeOptions): number

endTranscriptStep(hasMore: boolean, options?: TranscriptRuntimeOptions): void

type ToolStepResult =
  | { kind: "text"; result: unknown }
  | { kind: "create-content"; content: string }
  | {
      kind: "edit-diff";
      path: string;
      oldText: string;
      newText: string;
      contextBefore: string[];
      contextAfter: string[];
      lineIndent: string;
      /** 1-based file line number of the first rendered line (context or diff). */
      startLine: number;
    }
  | { kind: "error"; error: unknown };

interface ToolStep {
  name: string;
  displayArgs: Record<string, unknown>;
  rationale?: string;
  /** true → use formatParsedToolCallLine (the "~" prefix) */
  parsedTools?: boolean;
  result: ToolStepResult;
}

interface ToolCallHeaderRows {
  /** The header itself: lead-in blanks + optional rationale + the call line. */
  header: number;
  /** The model's response text directly above the header; 0 when it isn't adjacent. */
  preamble: number;
}

interface RenderedStep {
  text?: string;
  tools?: ToolStep[];
}

writeToolCallHeader(step: Pick<ToolStep, "name" | "displayArgs" | "rationale" | "parsedTools">, opts?: TranscriptRuntimeOptions | undefined): ToolCallHeaderRows

writeToolResultPreview(name: string, result: { kind: "text"; result: unknown; } | { kind: "create-content"; content: string; } | { kind: "edit-diff"; path: string; oldText: string; newText: string; contextBefore: string[]; contextAfter: string[]; lineIndent: string; startLine: number; }, opts?: TranscriptRuntimeOptions | undefined): boolean

writeToolStepResult(name: string, result: ToolStepResult, opts?: TranscriptRuntimeOptions | undefined): void

renderToolStep(step: ToolStep, opts?: TranscriptRuntimeOptions | undefined): void

renderTurn(steps: RenderedStep[], opts?: TranscriptRuntimeOptions | undefined): void
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `DiffEntry` — re-exported from `util/line-diff.ts`; `equal | remove | add` diff entry type.
- `formatEditFileDiff()` — smart diff renderer; red/green for changed lines, dim for file context. Prefixes every line with a dim right-aligned line-number gutter (removed lines keep old-file numbers, everything else new-file numbers), starting at `startLine`; same gutter format as `read`/`create` (via [util/line-numbers.md](../util/line-numbers.md)).
- `formatCreatedFileContent()` — create-file preview; numbers content from line 1 with the shared gutter, then dims/truncates like `formatToolResultPreview`.
- `formatParsedToolCallLine()` — like `formatToolCallLine` but prefixes `~ `.
- `formatTranscriptStepDivider(options?)` — returns one raw divider line (no newlines); uses the target stream's column width when `options` is provided.
- `writeStepSeparator(options?)` — single authority for divider spacing: writes a single full-width divider line with one blank line above and one below, so content is set off from the separator on both sides. Every divider-emitting site (`beginTranscriptTurn` deferred flush, `endTranscriptStep` close) routes through it.
- Higher-level API (`writeToolCallHeader`, `writeToolStepResult`, `renderToolStep`, `renderTurn`) — sit on top of the format helpers and state machine so that both the live agent path (`tools/index.ts withToolRendering`) and the `/renderer` demo (`commands/renderer.ts`) share one implementation. `writeToolCallHeader` is called BEFORE tool execution; `writeToolStepResult` is called AFTER.
- `writeToolCallHeader` returns `ToolCallHeaderRows` (wrap included) rather than `void`, and `writeTranscriptToolLeadIn` returns its own rows. Only the approval path reads them — it budgets the preview that follows against the real height of what sits above it, which a constant cannot express because the call line, the rationale and the preamble can all wrap. `preamble` is measured before the lead-in bumps `toolCount`, and is 0 for any parallel call after the step's first: only that first call sits directly under the response text.
- `TranscriptRenderOptions.maxResultRows` — caps the preview at N terminal rows counting wrap, on top of `maxResultLines`; see [transcript-options.md](transcript-options.md) for the type and [tool-approval.md](tool-approval.md) for who sets it. Honoured by both `formatToolResultPreview` and `formatEditFileDiff`: `edit` (like `create`) previews its diff before confirmation, so the diff must also fit the approval row budget or a long change would scroll the call line the user is approving off-screen. Both trim via `fitLinesToRows`, measuring the rendered (gutter + colour) width, and report the dropped count in a "… (N more lines)" footer.
- Stream routing and the options types live in [transcript-options.md](transcript-options.md) and are re-exported here; keep importing them from this module.

## Desired Turn Layout

Each step is framed by a single-line `───` separator; consecutive steps share one (close of step N = open of step N+1). The separator has one blank line above and one below — content is set off from it on both sides (spacing owned entirely by `writeStepSeparator`). Rationale sits directly above its tool call (no blank between); response text and a following tool call are separated by one blank line.

Single step (response + tool call) and multi-step (shared separator):
```
───              ───

response text    [step N]

tool_call(args)  ───
  result preview
                 [step N+1]
───
```

## Turn State Machine

The module maintains a single `_step` state object. All callers drive it with these functions:

- `beginTranscriptTurn(opts?)` — open a turn; flushes the deferred separator from the previous turn (via `writeStepSeparator`) if one is pending. Idempotent (no-op if already open).
- `notifyTranscriptChunk(chunk)` — call each time a chunk of model response text is written to stdout; updates `hasText` / `textEndsWithNewline` and accumulates `text`, which exists so the step's preamble height is measurable at header time.
- `writeTranscriptToolLeadIn(opts?)` — call from `withToolRendering` in `tools/index.ts` immediately before writing the tool call line. Inserts the correct blank-line separator (blank after response text, blank between parallel tool calls).
- `endTranscriptStep(hasMore, opts?)` — close the current step. `hasMore=true` writes the combined close+open separator (via `writeStepSeparator`) for the next step; `hasMore=false` defers the closing separator (`_pendingDivider`) so it is only emitted if a next turn begins. No-op when no turn is open.

## Read When

- Changing how tool calls, tool errors, tool result previews, or agent step dividers are displayed.
- Changing eval/scripted transcript output policy.
- Debugging spacing issues between response text and tool calls.

## Runtime Options

`FREECODE_TRANSCRIPT_STREAM=stdout` moves transcript output (tool logs, dividers) to stdout; the default is stderr. `FREECODE_TRANSCRIPT_MAX_RESULT_LINES` controls preview truncation, defaulting to 30 lines and accepting `all` for unbounded previews. Neither raises the interactive `maxResultRows` cap: on a short terminal a pending-approval preview is trimmed further regardless, since the alternative is scrolling away the call the user is approving.

`FREECODE_TRACE_JSON` only controls machine-readable trace capture and should not be used to change visible transcript formatting.
