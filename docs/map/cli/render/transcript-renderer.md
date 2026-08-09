# src/cli/render/transcript-renderer.ts - Agent Transcript Formatting

**Role:** Turn/step state machine and writing for all visible agent transcript output. The state machine here is the single authority for turn layout — every path through `agentLoop` and `runParsedToolsLoop` delegates spacing decisions to these functions so that model-specific differences in whitespace are absorbed here and can never leak into the displayed transcript.

The pure formatters (`format*`) now live in [transcript-format.md](transcript-format.md) and are re-exported here, so this stays the single import site. This module is what *writes*; that one is what decides how things *look*.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export type { DiffEntry } from "../../util/line-diff.js"

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

export {
  filterArgs,
  formatArgs,
  formatCreatedFileContent,
  formatEditFileDiff,
  formatParsedToolCallLine,
  formatPromptEcho,
  formatRationaleLine,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
  formatTranscriptStepDivider,
} from "./transcript-format.js"

/**
 * Write the complete step separator block — the single authority for divider
 * spacing. The separator is a single full-width line with one blank line above
 * and one below, so content is set off from it on both sides. Every site that
 * emits a divider (between-step close, between-turn flush) routes through here so
 * the separator's look and surrounding whitespace live in exactly one place.
 */
writeStepSeparator(options?: TranscriptRuntimeOptions): void

/**
 * Open a new agent turn. Idempotent — safe to call when a turn is already open.
 * First turn emits no leading divider. Subsequent turns flush the deferred divider
 * from the previous turn's close (so it acts as a between-turn separator).
 */
beginTranscriptTurn(options?: TranscriptRuntimeOptions): void

/**
 * Record that a model text chunk was written to the output stream.
 * Call once per chunk (or with the full text for non-streaming paths).
 */
notifyTranscriptChunk(chunk: string): void

/**
 * Write a chunk of model text: to the screen, to the step state machine, and to
 * the transcript record. `chunk` must be the text exactly as it appears — already
 * markdown-rendered — because the record replays it verbatim.
 *
 * Goes through the transcript stream like every other transcript write. It used to
 * hardcode `process.stdout`, from when the stream defaulted to stderr and model
 * text had to escape that; now stdout *is* the default, so the only stream this
 * respects that it previously ignored is `null` — which has to silence model text
 * too, or `-p` prints the response twice (once streamed here, once from
 * `result.text`). The record/notify hooks still fire: they are in-memory state for
 * replay, not output.
 */
writeTranscriptText(chunk: string, options?: TranscriptRuntimeOptions): void

/**
 * Drop the turn/step state so a replay starts from a clean slate instead of
 * inheriting the divider the last live turn deferred. `pendingDivider` restores
 * it afterwards, leaving the machine as a completed turn would.
 */
resetTranscriptTurnState(pendingDivider?: boolean): void

/**
 * Write the separator immediately before a tool call line.
 * Inserts a blank line after response text (if any) and between parallel tool calls.
 * Returns the rows it advanced the cursor by, so writeToolCallHeader can report
 * the full header height.
 */
writeTranscriptToolLeadIn(options?: TranscriptRuntimeOptions): number

/**
 * Close the current step.
 * hasMore=true: another step follows — the divider doubles as the next step's opener.
 * hasMore=false: final step — writes only the closing divider.
 * No-op when no turn is open.
 */
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
  | { kind: "error"; error: unknown }
  /**
   * An already-rendered preview block, written verbatim. Only the transcript
   * record produces these: it stores the block that was put on screen rather
   * than the raw result behind it, so a replayed body is byte-identical (and
   * bounded — see cli/render/transcript-record.ts).
   */
  | { kind: "preformatted"; text: string };

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

/**
 * Write the lead-in separator, optional rationale line, and tool call line.
 * The live path calls this BEFORE executing the tool; the result is written
 * separately via writeToolStepResult after execution completes.
 *
 * Returns the heights, in wrapped terminal rows, of what now sits above the
 * result. The approval path budgets its preview against these so this header —
 * and the model's preamble explaining the call — stay on screen; see
 * agent/tools/index.ts.
 */
writeToolCallHeader(step: Pick<ToolStep, "name" | "displayArgs" | "rationale" | "parsedTools">, opts?: TranscriptRuntimeOptions | undefined): ToolCallHeaderRows

/**
 * Write the preview block for a non-error tool result (edit diff, created
 * file content, or plain text). Returns whether anything was written, so
 * callers that print a preview ahead of execution (read-only precompute) can
 * tell the later post-execution write to skip a duplicate.
 */
writeToolResultPreview(name: string, result: { kind: "text"; result: unknown; } | { kind: "create-content"; content: string; } | { kind: "edit-diff"; path: string; oldText: string; newText: string; contextBefore: string[]; contextAfter: string[]; lineIndent: string; startLine: number; } | { ...; }, opts?: TranscriptRuntimeOptions | undefined): boolean

/**
 * Write the preview or error block for a completed tool call.
 * For errors, always writes the error line.
 * For successful results, writes the preview only when non-empty.
 */
writeToolStepResult(name: string, result: ToolStepResult, opts?: TranscriptRuntimeOptions | undefined): void

/**
 * Render a complete tool step: header (lead-in + call line) then result preview.
 */
renderToolStep(step: ToolStep, opts?: TranscriptRuntimeOptions | undefined): void

/**
 * Render a complete agent turn: one beginTranscriptTurn followed by one or
 * more RenderedSteps (each with optional text and zero or more tool calls),
 * each closed by endTranscriptStep.
 */
renderTurn(steps: RenderedStep[], opts?: TranscriptRuntimeOptions | undefined): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`cli/render/transcript-options.ts`](transcript-options.md) ×33, [`cli/render/transcript-format.ts`](transcript-format.md) ×19, [`cli/render/transcript-record.ts`](transcript-record.md) ×5, [`util/wrap-rows.ts`](../../util/wrap-rows.md) ×4, [`util/line-diff.ts`](../../util/line-diff.md) ×1
- **Imported by:** [`agent/tools/wrappers.ts`](../../agent/tools/wrappers.md) ×16, [`agent/loop.ts`](../../agent/loop.md) ×15, [`commands/renderer.ts`](../../commands/renderer.md) ×11, [`agent/parsed-tools.ts`](../../agent/parsed-tools.md) ×8, [`cli/render/transcript-record.ts`](transcript-record.md) ×7, [`cli/render/transcript-replay.ts`](transcript-replay.md) ×7, [`agent/fake-loop.ts`](../../agent/fake-loop.md) ×6, [`agent/tools/edit-diff-context.ts`](../../agent/tools/edit-diff-context.md) ×1, +2 more

## Tests

`tests/cli/render/transcript-renderer.test.ts`. 1 other test file references it.

## Budget

398 / 500 lines (102 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `DiffEntry` — re-exported from `util/line-diff.ts`; `equal | remove | add` diff entry type.
- `formatEditFileDiff()` — smart diff renderer; red/green for changed lines, dim for file context. Prefixes every line with a dim right-aligned line-number gutter (removed lines keep old-file numbers, everything else new-file numbers), starting at `startLine`; same gutter format as `read`/`create` (via [util/line-numbers.md](../../util/line-numbers.md)).
- `formatCreatedFileContent()` — create-file preview; numbers content from line 1 with the shared gutter, then dims/truncates like `formatToolResultPreview`.
- `formatParsedToolCallLine()` — like `formatToolCallLine` but prefixes `~ `.
- `formatTranscriptStepDivider(options?)` — returns one raw divider line (no newlines); uses the target stream's column width when `options` is provided.
- `writeStepSeparator(options?)` — single authority for divider spacing: writes a single full-width divider line with one blank line above and one below, so content is set off from the separator on both sides. Every divider-emitting site (`beginTranscriptTurn` deferred flush, `endTranscriptStep` close) routes through it.
- Higher-level API (`writeToolCallHeader`, `writeToolStepResult`, `renderToolStep`, `renderTurn`) — sit on top of the format helpers and state machine so that both the live agent path (`tools/index.ts withToolRendering`) and the `/renderer` demo (`commands/renderer.ts`) share one implementation. `writeToolCallHeader` is called BEFORE tool execution; `writeToolStepResult` is called AFTER.
- `writeToolCallHeader` returns `ToolCallHeaderRows` (wrap included) rather than `void`, and `writeTranscriptToolLeadIn` returns its own rows. Only the approval path reads them — it budgets the preview that follows against the real height of what sits above it, which a constant cannot express because the call line, the rationale and the preamble can all wrap. `preamble` is measured before the lead-in bumps `toolCount`, and is 0 for any parallel call after the step's first: only that first call sits directly under the response text.
- `TranscriptRenderOptions.maxResultRows` — caps the preview at N terminal rows counting wrap, on top of `maxResultLines`; see [transcript-options.md](./transcript-options.md) for the type and [tool-approval.md](../tools/tool-approval.md) for who sets it. Honoured by both `formatToolResultPreview` and `formatEditFileDiff`: `edit` (like `create`) previews its diff before confirmation, so the diff must also fit the approval row budget or a long change would scroll the call line the user is approving off-screen. Both trim via `fitLinesToRows`, measuring the rendered (gutter + colour) width, and report the dropped count in a "… (N more lines)" footer.
- Stream routing and the options types live in [transcript-options.md](./transcript-options.md) and are re-exported here; keep importing them from this module. The same goes for the `format*` helpers, which live in [transcript-format.md](transcript-format.md).
- `ToolStepResult`'s `preformatted` kind is produced only by [transcript-record.md](transcript-record.md), which stores the rendered preview block rather than the raw result behind it. `writeToolResultPreview` writes it verbatim.
- `writeToolCallHeader`, `writeToolResultPreview`, `writeToolStepResult` and `endTranscriptStep` all feed the transcript record as a side effect, so any caller that renders normally is recorded automatically and a replay cannot drift from the live paint.

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
- `notifyTranscriptChunk(chunk)` — call each time a chunk of model response text is written to stdout; updates `hasText` / `textEndsWithNewline` and accumulates `text`, which exists so the step's preamble height is measurable at header time. Prefer `writeTranscriptText` — the one place that still calls this directly is `parsed-tools.ts`, marking an empty step as having produced text when nothing was actually written.
- `writeTranscriptText(chunk)` — write model text to stdout, notify the state machine, and record it for replay, in that order. `chunk` must be the text exactly as it appears (already markdown-rendered), since [transcript-record.md](transcript-record.md) replays it verbatim. Stays on `process.stdout` rather than the transcript stream, which is where model text has always gone; the two differ only off-TTY, where nothing replays.
- `resetTranscriptTurnState(pendingDivider?)` — drop the turn/step state. Only [transcript-replay.md](transcript-replay.md) needs it, to keep a replay from inheriting the divider the last live turn deferred and to restore that state afterwards.
- `writeTranscriptToolLeadIn(opts?)` — call from `withToolRendering` in `tools/index.ts` immediately before writing the tool call line. Inserts the correct blank-line separator (blank after response text, blank between parallel tool calls).
- `endTranscriptStep(hasMore, opts?)` — close the current step. `hasMore=true` writes the combined close+open separator (via `writeStepSeparator`) for the next step; `hasMore=false` defers the closing separator (`_pendingDivider`) so it is only emitted if a next turn begins. No-op when no turn is open.

## Read When

- Changing how tool calls, tool errors, tool result previews, or agent step dividers are displayed.
- Changing eval/scripted transcript output policy.
- Debugging spacing issues between response text and tool calls.

## Runtime Options

Transcript output (tool logs, dividers, and model text) goes to stdout; `FREECODE_TRANSCRIPT_STREAM=null` silences it. See [transcript-options.md](./transcript-options.md) for why `stderr` is gone.

**`writeTranscriptText` honours the stream**, and takes the same optional `options` as every other writer here. It used to write straight to `process.stdout`, from when the default was stderr and model text had to escape that. Now that stdout *is* the default the only setting this newly respects is `null` — which must silence model text too, or `-p` prints the response twice (once streamed through here, once from `result.text`). The record/notify hooks still fire under `null`: they are in-memory state for replay, not output. Unit tests that assert on visible output therefore have to opt out of the suite-wide `null` (`vitest.config.ts`) with `vi.stubEnv`.

`FREECODE_TRANSCRIPT_MAX_RESULT_LINES` controls preview truncation, defaulting to 30 lines and accepting `all` for unbounded previews. Neither raises the interactive `maxResultRows` cap: on a short terminal a pending-approval preview is trimmed further regardless, since the alternative is scrolling away the call the user is approving.

`FREECODE_TRACE_JSON` only controls machine-readable trace capture and should not be used to change visible transcript formatting.
