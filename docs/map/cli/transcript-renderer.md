# src/cli/transcript-renderer.ts - Agent Transcript Formatting

**Role:** Shared formatting for visible agent transcript fragments.

## Exports

- `formatArgs()`
- `formatToolCallLine()`
- `formatToolErrorLine()`
- `formatToolResultPreview()`
- `formatTranscriptStepDivider()`
- `getTranscriptRuntimeOptions()`
- `getTranscriptStream()`
- `writeTranscriptStepDivider()`

## Read When

- Changing how tool calls, tool errors, tool result previews, or agent step dividers are displayed.
- Changing eval/scripted transcript output policy.
- Decoupling machine trace capture from visible terminal output.

## Runtime Options

`FREECODE_TRANSCRIPT_STREAM=stdout` moves visible transcript output to stdout; the default is stderr for tool logs. `FREECODE_TRANSCRIPT_MAX_RESULT_LINES` controls preview truncation, defaulting to 30 lines and accepting `all` for unbounded previews.

`FREECODE_TRACE_JSON` only controls machine-readable trace capture and should not be used to change visible transcript formatting.

## Step Dividers

Tool-enabled agent turns emit visible dividers around model/tool steps so parallel tool calls from one model response can be distinguished from later calls that used prior tool results. The divider writes to the configured transcript stream.
