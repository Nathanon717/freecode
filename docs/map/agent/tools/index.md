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
  /**
   * The exact result string this call will send to the model, set only when the
   * result was precomputed before confirmation (read/grep/list_dir). The approval
   * UI runs it through the local tokenizer to show how many tokens approving adds.
   */
  resultText?: string;
}

interface ToolCallConfirmation {
  approved: boolean;
  message?: string;
}

type ConfirmToolCall = (
  preview: ToolCallPreview,
) => Promise<boolean | ToolCallConfirmation>;

READ_ONLY_TOOL_DEFS: Record<'read' | 'grep' | 'list_dir', AnyCoreTool>

WRITE_TOOL_DEFS: Record<'create' | 'edit' | 'shell_exec', AnyCoreTool>

createTools(confirmToolCall?: ConfirmToolCall | undefined, toolRationale?: boolean | undefined, parsedTools?: boolean, readOnly?: boolean, spawnAgent?: SpawnAgentFn | undefined): Record<...>

readFileTool: CoreTool<ZodObject<{ path: ZodString; offset: ZodOptional<ZodNumber>; limit: ZodOptional<ZodNumber>; }, "strip", ZodTypeAny, { ...; }, { ...; }>, string> & { ...; }

createFileTool: CoreTool<ZodObject<{ path: ZodString; content: ZodString; }, "strip", ZodTypeAny, { path: string; content: string; }, { path: string; content: string; }>, string> & { ...; }

editTool: CoreTool<ZodObject<{ path: ZodString; old_text: ZodString; new_text: ZodString; }, "strip", ZodTypeAny, { path: string; old_text: string; new_text: string; }, { ...; }>, string> & { ...; }

grepTool: CoreTool<ZodObject<{ pattern: ZodString; path: ZodOptional<ZodString>; include: ZodOptional<ZodString>; output_mode: ZodOptional<ZodEnum<["content", "files_with_matches", "count"]>>; case_insensitive: ZodOptional<...>; context_lines: ZodOptional<...>; multiline: ZodOptional<...>; head_limit: ZodOptional<...>; }, "st...

shellTool: CoreTool<ZodObject<{ command: ZodString; timeout_ms: ZodOptional<ZodNumber>; confirmDestructive: ZodOptional<ZodBoolean>; }, "strip", ZodTypeAny, { ...; }, { ...; }>, string> & { ...; }

listDirTool: CoreTool<ZodObject<{ path: ZodOptional<ZodString>; }, "strip", ZodTypeAny, { path?: string | undefined; }, { path?: string | undefined; }>, string> & { ...; }
```
<!-- END GENERATED EXPORTS -->

## Tool Keys

| Key | Tool | Source | Half |
|-----|------|--------|------|
| `read` | `readFileTool` | `./read` | read-only |
| `grep` | `grepTool` | `./grep` | read-only |
| `list_dir` | `listDirTool` | `./list-dir` | read-only |
| `create` | `createFileTool` | `./create` | write |
| `edit` | `editTool` | `./edit` | write |
| `shell_exec` | `shellTool` | `./shell` | write |

`READ_ONLY_TOOL_DEFS` / `WRITE_TOOL_DEFS` are the name → tool maps for those two
halves; the names themselves live in [tool-names.md](tool-names.md) (a leaf module
with no imports, so the boot path can read them without loading the `ai` SDK).
`createTools` wraps whichever halves apply, and `withConfirmation` decides what is
safe to precompute with `isReadOnlyTool` rather than a second list.

**`readOnly` returns the read-only half alone — including no `spawn_agent`.** A
sub-agent is itself read-only, but a call spends a whole LLM sub-turn, which is more
than reading, and the headless `-p` mode ([../../cli/headless-prompt.md](../../cli/headless-prompt.md))
must not be able to fan out. `spawn_agent` is otherwise present only when the caller
injects a model-bound runner (`agent/loop.ts` does; the hand-typed and parsed-tools
paths do not).

## Wrapper Stack

The effective order is:

1. `withRationale` when `loadConfig().toolRationale` is true. It adds a required `rationale` string to the Zod schema and strips it before calling the real tool.
2. `withConfirmation`. It calls the mode-supplied approval callback and returns a denial string to the model when rejected or no callback exists. For `read`/`grep`/`list_dir` (the read-only tool set) it runs the real tool *before* the callback and reuses that result on approval instead of re-running it — safe only because those three have no side effect beyond reading. Immediately after precomputing — or, without executing early because writing is not safe pre-confirmation, for `create` from `args.content` and for `edit` from `args.old_text`/`new_text` plus the diff context `withToolRendering` stashed in `PreviewState.editContext` — it writes the grey/dim content preview via `writeToolResultPreview` from `cli/render/transcript-renderer.ts`. This is the same call the post-execution path uses, so it must go through the transcript stream at header-write time, not through the approval UI after `teardownBottomUI` (that ordering silently drops output outside the active scroll region — verified live via a PTY session). The `edit` preview is a projection: it renders the intended diff even if `old_text` won't ultimately match, and the tool still errors on execute in that case. Only `shell_exec` never previews early. That preview is capped by `getApprovalPreviewRowBudget` (`cli/tools/tool-approval.ts`) to the rows left between the approval hint and the content above it, so a long result cannot scroll the call line the user is approving — or the model's preamble explaining it — off the top; the budget needs their real heights, which `withToolRendering` records in the shared `PreviewState` box as `rowsAbove`. The cap is transcript-only — the model still gets the full result. For the three precomputed tools it also passes the exact result string on the preview as `resultText`, so the approval UI (via `cli/session-modes.ts`) can tokenize it and show how many tokens approving adds. When the preview was actually written and the call is approved, `withToolRendering`'s post-execution result write is suppressed via a shared `PreviewState` box so the same content doesn't print twice; on denial the preview stays but the denial message still prints normally.
3. `withToolRendering`. Delegates all transcript output to the shared orchestration API in `cli/render/transcript-renderer.ts`. It first `await`s `awaitToolRenderGate()` (`agent/tool-render-gate.ts`) so that on the native `fullStream` path the header waits until the stream consumer has flushed this step's preamble text (a no-op on non-streaming paths); then calls `writeToolCallHeader(...)` (lead-in + optional rationale + call line) before tool execution, stashing its returned row heights in `PreviewState.rowsAbove` for the approval preview budget above, then `writeToolStepResult(name, result)` after execution completes or `writeToolStepResult(name, { kind: 'error', error })` on failure. For an `edit` it calls `computeEditDiffContext` (in [edit-diff-context.md](edit-diff-context.md)) before the tool runs — the diff context must be read from disk while the file is still in its pre-edit state — and stashes the result in `PreviewState.editContext` so `withConfirmation` can render the pending-approval diff from the same single disk read. Also appends JSON trace events to `FREECODE_TRACE_JSON` when set.
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

Visible transcript output goes to stdout. `FREECODE_TRANSCRIPT_STREAM=null` silences it (unit tests, and `-p`, which prints the final response itself); `FREECODE_TRANSCRIPT_MAX_RESULT_LINES` overrides the default result preview limit. See [../../cli/render/transcript-options.md](../../cli/render/transcript-options.md).
