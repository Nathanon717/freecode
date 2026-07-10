# src/cli/transcript-renderer.ts - Agent Transcript Formatting

**Role:** Shared formatting and normalisation for all visible agent transcript output. The state machine here is the single authority for turn layout — every path through `agentLoop` and `runPromptToolsLoop` delegates spacing decisions to these functions so that model-specific differences in whitespace are absorbed here and can never leak into the displayed transcript.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export type { DiffEntry } from "../util/line-diff.js"

type TranscriptStreamName = "stdout" | "stderr" | "null";

interface TranscriptRenderOptions {
  maxResultLines?: number;
}

interface TranscriptRuntimeOptions extends TranscriptRenderOptions {
  stream: TranscriptStreamName;
}

DEFAULT_TRANSCRIPT_MAX_RESULT_LINES: 30

TRANSCRIPT_DIVIDER_WIDTH: 60

formatArgs(args: Record<string, unknown>): string

filterArgs(name: string, args: Record<string, unknown>): Record<string, unknown>

formatRationaleLine(rationale: string): string

formatToolCallLine(name: string, args: Record<string, unknown>): string

formatPromptToolCallLine(name: string, args: Record<string, unknown>): string

formatToolErrorLine(name: string, err: unknown): string

formatToolResultPreview(result: unknown, options?: TranscriptRenderOptions): string

formatEditFileDiff(_path: string, oldText: string, newText: string, contextBefore?: string[], contextAfter?: string[], options?: TranscriptRenderOptions, lineIndent?: string): string

formatTranscriptStepDivider(options?: TranscriptRuntimeOptions | undefined): string

beginTranscriptTurn(options?: TranscriptRuntimeOptions): void

notifyTranscriptChunk(chunk: string): void

writeTranscriptToolLeadIn(options?: TranscriptRuntimeOptions): void

endTranscriptStep(hasMore: boolean, options?: TranscriptRuntimeOptions): void

getTranscriptRuntimeOptions(env?: ProcessEnv): TranscriptRuntimeOptions

getTranscriptStream(options?: TranscriptRuntimeOptions): WritableStream

writeTranscriptStepDivider(options?: TranscriptRuntimeOptions): void

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
    }
  | { kind: "error"; error: unknown };

interface ToolStep {
  name: string;
  displayArgs: Record<string, unknown>;
  rationale?: string;
  /** true → use formatPromptToolCallLine (the "~" prefix) */
  promptTools?: boolean;
  result: ToolStepResult;
}

interface RenderedStep {
  text?: string;
  tools?: ToolStep[];
}

writeToolCallHeader(step: Pick<ToolStep, "name" | "displayArgs" | "rationale" | "promptTools">, opts?: TranscriptRuntimeOptions | undefined): void

writeToolResultPreview(name: string, result: { kind: "text"; result: unknown; } | { kind: "create-content"; content: string; } | { kind: "edit-diff"; path: string; oldText: string; newText: string; contextBefore: string[]; contextAfter: string[]; lineIndent: string; }, opts?: TranscriptRuntimeOptions | undefined): boolean

writeToolStepResult(name: string, result: ToolStepResult, opts?: TranscriptRuntimeOptions | undefined): void

renderToolStep(step: ToolStep, opts?: TranscriptRuntimeOptions | undefined): void

renderTurn(steps: RenderedStep[], opts?: TranscriptRuntimeOptions | undefined): void
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `DiffEntry` — re-exported from `util/line-diff.ts`; `equal | remove | add` diff entry type.
- `formatEditFileDiff()` — smart diff renderer; red/green for changed lines, dim for file context.
- `formatPromptToolCallLine()` — like `formatToolCallLine` but prefixes `~ `.
- `formatTranscriptStepDivider(options?)` — returns the raw divider string (no newlines); uses the target stream's column width when `options` is provided.
- `writeTranscriptStepDivider()` — legacy; kept for backward compatibility.
- Higher-level API (`writeToolCallHeader`, `writeToolStepResult`, `renderToolStep`, `renderTurn`) — sit on top of the format helpers and state machine so that both the live agent path (`tools/index.ts withLogging`) and the `/renderer` demo (`commands/renderer.ts`) share one implementation. `writeToolCallHeader` is called BEFORE tool execution; `writeToolStepResult` is called AFTER.

## Desired Turn Layout

Each step is framed by a pair of `───` dividers; consecutive steps share one (close of step N = open of step N+1). Inside a step, a blank line separates the divider from content on both sides. Rationale sits directly above its tool call (no blank between); response text and a following tool call are separated by one blank line.

Single step (response + tool call) and multi-step (shared divider):
```
───              ───

response text    [step N]

tool_call(args)  ───
  result preview
                 [step N+1]
───
                 ───
```

## Turn State Machine

The module maintains a single `_step` state object. All callers drive it with these functions:

- `beginTranscriptTurn(opts?)` — open a turn; writes opening divider + blank line. Idempotent (no-op if already open).
- `notifyTranscriptChunk(chunk)` — call each time a chunk of model response text is written to stdout; updates `hasText` / `textEndsWithNewline`.
- `writeTranscriptToolLeadIn(opts?)` — call from `withLogging` in `tools/index.ts` immediately before writing the tool call line. Inserts the correct blank-line separator (blank after response text, blank between parallel tool calls).
- `endTranscriptStep(hasMore, opts?)` — close the current step. `hasMore=true` writes the combined close+open divider for the next step; `hasMore=false` writes only the final closing divider. No-op when no turn is open.

## Read When

- Changing how tool calls, tool errors, tool result previews, or agent step dividers are displayed.
- Changing eval/scripted transcript output policy.
- Debugging spacing issues between response text and tool calls.

## Runtime Options

`FREECODE_TRANSCRIPT_STREAM=stdout` moves transcript output (tool logs, dividers) to stdout; the default is stderr. `FREECODE_TRANSCRIPT_MAX_RESULT_LINES` controls preview truncation, defaulting to 30 lines and accepting `all` for unbounded previews.

`FREECODE_TRACE_JSON` only controls machine-readable trace capture and should not be used to change visible transcript formatting.
