# src/agent/tools/index.ts - Tool Registry

**Role:** Aggregates all agent tools and wraps them with rationale support, confirmation, logging, trace capture, and serialized execution.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface ToolCallPreview {
  name: string;
  args: Record<string, unknown>;
  /**
   * True when a read-only content preview was already flowed to the transcript
   * (right after the header, before this confirmation call) for this tool call.
   * Interactive UIs that draw a menu at fixed terminal rows near the bottom
   * need this to pad clearance so they don't overwrite the preview's tail —
   * see cli/tool-approval.ts.
   */
  previewedContent?: boolean;
}

interface ToolCallConfirmation {
  approved: boolean;
  message?: string;
}

type ConfirmToolCall = (
  preview: ToolCallPreview,
) => Promise<boolean | ToolCallConfirmation>;

createTools(confirmToolCall?: ConfirmToolCall | undefined, toolRationale?: boolean | undefined, parsedTools?: boolean, readOnly?: boolean): { read: AnyCoreTool; grep: AnyCoreTool; list_dir: AnyCoreTool; } | { ...; }

readFileTool: CoreTool<ZodObject<{ path: ZodString; offset: ZodOptional<ZodNumber>; limit: ZodOptional<ZodNumber>; }, "strip", ZodTypeAny, { ...; }, { ...; }>, string> & { ...; }

createFileTool: CoreTool<ZodObject<{ path: ZodString; content: ZodString; }, "strip", ZodTypeAny, { path: string; content: string; }, { path: string; content: string; }>, string> & { ...; }

editTool: CoreTool<ZodObject<{ path: ZodString; old_text: ZodString; new_text: ZodString; }, "strip", ZodTypeAny, { path: string; old_text: string; new_text: string; }, { ...; }>, string> & { ...; }

grepTool: CoreTool<ZodObject<{ pattern: ZodString; path: ZodOptional<ZodString>; include: ZodOptional<ZodString>; }, "strip", ZodTypeAny, { ...; }, { ...; }>, string> & { ...; }

shellTool: CoreTool<ZodObject<{ command: ZodString; timeout_ms: ZodOptional<ZodNumber>; confirmDestructive: ZodOptional<ZodBoolean>; }, "strip", ZodTypeAny, { ...; }, { ...; }>, string> & { ...; }

listDirTool: CoreTool<ZodObject<{ path: ZodOptional<ZodString>; }, "strip", ZodTypeAny, { path?: string | undefined; }, { path?: string | undefined; }>, string> & { ...; }
```
<!-- END GENERATED EXPORTS -->

## Tool Keys

| Key | Tool | Source |
|-----|------|--------|
| `read` | `readFileTool` | `./read` |
| `create` | `createFileTool` | `./create` |
| `edit` | `editTool` | `./edit` |
| `grep` | `grepTool` | `./grep` |
| `shell_exec` | `shellTool` | `./shell` |
| `list_dir` | `listDirTool` | `./list-dir` |

## Wrapper Stack

The effective order is:

1. `withRationale` when `loadConfig().toolRationale` is true. It adds a required `rationale` string to the Zod schema and strips it before calling the real tool.
2. `withConfirmation`. It calls the mode-supplied approval callback and returns a denial string to the model when rejected or no callback exists. For `read`/`grep`/`list_dir` (the read-only tool set) it runs the real tool *before* the callback and reuses that result on approval instead of re-running it — safe only because those three have no side effect beyond reading. Immediately after precomputing (or, for `create`, immediately from `args.content` without executing early — writing is not safe pre-confirmation), it writes the grey/dim content preview via `writeToolResultPreview` from `cli/transcript-renderer.ts` — the same call the post-execution path uses, so it must go through the transcript stream at header-write time, not through the approval UI after `teardownBottomUI` (that ordering silently drops output outside the active scroll region — verified live via a PTY session). `edit`/`shell_exec` never precompute or preview early. That preview is capped by `getApprovalPreviewRowBudget` (`cli/tool-approval.ts`) to the rows left between the approval hint and the content above it, so a long result cannot scroll the call line the user is approving — or the model's preamble explaining it — off the top; the budget needs their real heights, which `withToolRendering` records in the shared `PreviewState` box as `rowsAbove`. The cap is transcript-only — the model still gets the full result. When the preview was actually written and the call is approved, `withToolRendering`'s post-execution result write is suppressed via a shared `PreviewState` box so the same content doesn't print twice; on denial the preview stays but the denial message still prints normally.
3. `withToolRendering`. Delegates all transcript output to the shared orchestration API in `cli/transcript-renderer.ts`. It first `await`s `awaitToolRenderGate()` (`agent/tool-render-gate.ts`) so that on the native `fullStream` path the header waits until the stream consumer has flushed this step's preamble text (a no-op on non-streaming paths); then calls `writeToolCallHeader(...)` (lead-in + optional rationale + call line) before tool execution, stashing its returned row heights in `PreviewState.rowsAbove` for the approval preview budget above, then `writeToolStepResult(name, result)` after execution completes or `writeToolStepResult(name, { kind: 'error', error })` on failure. The edit-context computation (diff context lines from disk) remains here because it requires `fs`/`cwd` and must happen before the tool runs. Also appends JSON trace events to `FREECODE_TRACE_JSON` when set.
4. `withSerializedExecution`. It chains tool calls through one promise queue.

## Trace Events

Trace entries contain:

```typescript
{
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}
```

Trace failures are swallowed so test tracing cannot break an agent run.

Visible transcript output defaults to stderr. Set `FREECODE_TRANSCRIPT_STREAM=stdout` for captured eval/scripted runs that need to replay the same transcript in stdout, and `FREECODE_TRANSCRIPT_MAX_RESULT_LINES` to override the default result preview limit.
