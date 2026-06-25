# src/agent/tools/index.ts - Tool Registry

**Role:** Aggregates all agent tools and wraps them with rationale support, confirmation, logging, trace capture, and serialized execution.

## Exports

```typescript
interface ToolCallPreview {
  name: string;
  args: Record<string, unknown>;
}

interface ToolCallConfirmation {
  approved: boolean;
  message?: string;
}

type ConfirmToolCall =
  (preview: ToolCallPreview) => Promise<boolean | ToolCallConfirmation>;

createTools(confirmToolCall?: ConfirmToolCall): Record<string, CoreTool>
allTools: Record<string, CoreTool>
```

Individual tools are re-exported for tests:

```text
readFileTool
createTool
editTool
grepTool
shellTool
listDirTool
```

## Tool Keys

| Key | Tool | Source |
|-----|------|--------|
| `read` | `readFileTool` | `./read` |
| `create` | `createTool` | `./create` |
| `edit` | `editTool` | `./edit` |
| `grep` | `grepTool` | `./grep` |
| `shell_exec` | `shellTool` | `./shell` |
| `list_dir` | `listDirTool` | `./list-dir` |

## Wrapper Stack

The effective order is:

1. `withRationale` when `loadConfig().toolRationale` is true. It adds a required `rationale` string to the Zod schema and strips it before calling the real tool.
2. `withConfirmation`. It calls the mode-supplied approval callback and returns a denial string to the model when rejected or no callback exists.
3. `withLogging`. Delegates all transcript output to the shared orchestration API in `cli/transcript-renderer.ts`: calls `writeToolCallHeader(...)` (lead-in + optional rationale + call line) before tool execution, then `writeToolStepResult(name, result)` after execution completes or `writeToolStepResult(name, { kind: 'error', error })` on failure. The edit-context computation (diff context lines from disk) remains here because it requires `fs`/`cwd` and must happen before the tool runs. Also appends JSON trace events to `FREECODE_TRACE_JSON` when set.
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
