# src/cli/transcript-renderer.ts - Agent Transcript Formatting

**Role:** Shared formatting and normalisation for all visible agent transcript output. The state machine here is the single authority for turn layout — every path through `agentLoop` and `runPromptToolsLoop` delegates spacing decisions to these functions so that model-specific differences in whitespace are absorbed here and can never leak into the displayed transcript.

## Desired Turn Layout

Each model step is framed by a pair of `───` dividers. Between consecutive steps the dividers are merged (the closing divider of step N is the opening divider of step N+1).

**Tool call only:**
```
───
                    ← blank line
tool_call(args)
  result preview
                    ← blank line
───
```

**Rationale + tool call** (rationale is part of the same block):
```
───

rationale
tool_call(args)
  result preview

───
```

**Response only:**
```
───

response text

───
```

**Response + tool call:**
```
───

response text

tool_call(args)
  result preview

───
```

**Multi-step turn (step N ends / step N+1 begins — shared divider):**
```
───

[step N content]

───

[step N+1 content]

───
```

## Turn State Machine

The module maintains a single `_step` state object. All callers drive it with these functions:

- `beginTranscriptTurn(opts?)` — open a turn; writes opening divider + blank line. Idempotent (no-op if already open).
- `notifyTranscriptChunk(chunk)` — call each time a chunk of model response text is written to stdout; updates `hasText` / `textEndsWithNewline`.
- `writeTranscriptToolLeadIn(opts?)` — call from `withLogging` in `tools/index.ts` immediately before writing the tool call line. Inserts the correct blank-line separator (blank after response text, blank between parallel tool calls).
- `endTranscriptStep(hasMore, opts?)` — close the current step. `hasMore=true` writes the combined close+open divider for the next step; `hasMore=false` writes only the final closing divider. No-op when no turn is open.

## Exports

### State machine (low-level)

- `beginTranscriptTurn()` — open turn (state machine entry)
- `notifyTranscriptChunk()` — track model text for spacing decisions
- `writeTranscriptToolLeadIn()` — normalised separator before each tool call
- `endTranscriptStep()` — close step / turn

### Format helpers (low-level)

- `DiffEntry` — re-exported from `util/line-diff.ts`; `equal | remove | add` diff entry type
- `formatArgs()`
- `formatEditFileDiff()` — smart diff renderer; red/green for changed lines, dim for file context
- `formatRationaleLine()`
- `formatToolCallLine()`
- `formatToolErrorLine()`
- `formatPromptToolCallLine()` — like `formatToolCallLine` but prefixes `~ `
- `formatToolResultPreview()`
- `formatTranscriptStepDivider(options?)` — returns the raw divider string (no newlines); uses the target stream's column width when `options` is provided
- `getTranscriptRuntimeOptions()`
- `getTranscriptStream()`
- `writeTranscriptStepDivider()` — legacy; kept for backward compatibility

### Higher-level orchestration API

These sit on top of the format helpers and state machine so that both the live agent path (`tools/index.ts withLogging`) and the `/renderer` demo (`commands/renderer.ts`) share one implementation.

- `ToolStepResult` — union type: `{ kind: 'text' }` | `{ kind: 'create-content' }` | `{ kind: 'edit-diff' }` | `{ kind: 'error' }`
- `ToolStep` — interface: `name`, `displayArgs`, `rationale?`, `promptTools?`, `result: ToolStepResult`
- `RenderedStep` — interface: `text?`, `tools?: ToolStep[]`
- `writeToolCallHeader(step, opts?)` — writes lead-in + optional rationale + call line (called BEFORE tool execution in the live path)
- `writeToolStepResult(name, result, opts?)` — writes preview or error line (called AFTER execution)
- `renderToolStep(step, opts?)` — convenience wrapper: `writeToolCallHeader` then `writeToolStepResult`
- `renderTurn(steps, opts?)` — full turn: `beginTranscriptTurn` + for each step write text/tools + `endTranscriptStep`

## Read When

- Changing how tool calls, tool errors, tool result previews, or agent step dividers are displayed.
- Changing eval/scripted transcript output policy.
- Debugging spacing issues between response text and tool calls.

## Runtime Options

`FREECODE_TRANSCRIPT_STREAM=stdout` moves transcript output (tool logs, dividers) to stdout; the default is stderr. `FREECODE_TRANSCRIPT_MAX_RESULT_LINES` controls preview truncation, defaulting to 30 lines and accepting `all` for unbounded previews.

`FREECODE_TRACE_JSON` only controls machine-readable trace capture and should not be used to change visible transcript formatting.
