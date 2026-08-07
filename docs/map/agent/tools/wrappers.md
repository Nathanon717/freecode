# src/agent/tools/wrappers.ts - Tool Wrapper Stack

**Role:** The decorator layer every offered tool is built from — rationale argument, user confirmation and approval preview, transcript rendering and trace capture, turn stop, and serialized execution. Split out of [index.md](index.md) at the 500-line limit; `index.ts` owns *which* tools exist and which a turn is offered, this file owns *what happens around each call*.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type AnyCoreTool = CoreTool<any, any>;

type QueuedToolExecution = <T>(task: () => Promise<T>) => Promise<T>;

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
  /**
   * Deny this call *and end the turn* — no further model call. Set when the user
   * presses Esc at an interactive approval prompt (`cli/tools/tool-approval.ts`).
   * The denial itself is an ordinary tool result; what stops the turn is the
   * `TurnStoppedError` `withTurnStop` throws once that result has rendered.
   */
  stopTurn?: boolean;
}

type ConfirmToolCall = (
  preview: ToolCallPreview,
) => Promise<boolean | ToolCallConfirmation>;

createToolExecutionQueue(): QueuedToolExecution

createTurnStopState(): TurnStopState

wrap(name: string, t: AnyCoreTool, useRationale: boolean, queueExecution: QueuedToolExecution, stopState: TurnStopState, confirmToolCall?: ConfirmToolCall | undefined, parsedTools?: boolean, requiresConfirmation?: boolean): AnyCoreTool
```
<!-- END GENERATED EXPORTS -->

## Wrapper Stack

`wrap()` applies the whole stack to one raw tool. The effective order is:

1. `withRationale` when `loadConfig().toolRationale` is true. It adds a required `rationale` string to the Zod schema and strips it before calling the real tool.
2. `withConfirmation`. It calls the mode-supplied approval callback and returns a denial string to the model when rejected or no callback exists. For `read`/`grep`/`list_dir` (the read-only tool set) it runs the real tool *before* the callback and reuses that result on approval instead of re-running it — safe only because those three have no side effect beyond reading. Immediately after precomputing — or, without executing early because writing is not safe pre-confirmation, for `create` from `args.content` and for `edit` from `args.old_text`/`new_text` plus the diff context `withToolRendering` stashed in `PreviewState.editContext` — it writes the grey/dim content preview via `writeToolResultPreview` from `cli/render/transcript-renderer.ts`. This is the same call the post-execution path uses, so it must go through the transcript stream at header-write time, not through the approval UI after `teardownBottomUI` (that ordering silently drops output outside the active scroll region — verified live via a PTY session). The `edit` preview is a projection: it renders the intended diff even if `old_text` won't ultimately match, and the tool still errors on execute in that case. Only `shell_exec` never previews early. That preview is capped by `getApprovalPreviewRowBudget` (`cli/tools/tool-approval.ts`) to the rows left between the approval hint and the content above it, so a long result cannot scroll the call line the user is approving — or the model's preamble explaining it — off the top; the budget needs their real heights, which `withToolRendering` records in the shared `PreviewState` box as `rowsAbove`. The cap is transcript-only — the model still gets the full result. For the three precomputed tools it also passes the exact result string on the preview as `resultText`, so the approval UI (via `cli/session-modes.ts`) can tokenize it and show how many tokens approving adds. When the preview was actually written and the call is approved, `withToolRendering`'s post-execution result write is suppressed via a shared `PreviewState` box so the same content doesn't print twice; on denial the preview stays but the denial message still prints normally.
3. `withToolRendering`. Delegates all transcript output to the shared orchestration API in `cli/render/transcript-renderer.ts`. It first `await`s `awaitToolRenderGate()` (`agent/tool-render-gate.ts`) so that on the native `fullStream` path the header waits until the stream consumer has flushed this step's preamble text (a no-op on non-streaming paths); then calls `writeToolCallHeader(...)` (lead-in + optional rationale + call line) before tool execution, stashing its returned row heights in `PreviewState.rowsAbove` for the approval preview budget above, then `writeToolStepResult(name, result)` after execution completes or `writeToolStepResult(name, { kind: 'error', error })` on failure. For an `edit` it calls `computeEditDiffContext` (in [edit-diff-context.md](edit-diff-context.md)) before the tool runs — the diff context must be read from disk while the file is still in its pre-edit state — and stashes the result in `PreviewState.editContext` so `withConfirmation` can render the pending-approval diff from the same single disk read. Also appends JSON trace events to `FREECODE_TRACE_JSON` when set. It never rethrows: a rejected `execute` produces no tool result, so the model would never learn the call failed and the SDK would end the turn — the error message is handed back as the result instead.
4. `withActivity`. See below. A no-op for every tool that is not `grep`, `shell_exec`, or `spawn_agent`.
5. `withTurnStop`. See below.
6. `withSerializedExecution`. It chains tool calls through one promise queue.

## Activity Label

`withActivity` names the tool the turn is currently blocked on, so the bottom UI's label can read `grepping...` / `shelling...` / `delegating...` instead of `thinking...`. It calls `setActivity` in `cli/chrome/turn-state.ts`, which owns the verb map and the label text; this layer owns only *when* a verb is on.

- **Only three tools get a verb.** `read`, `edit`, `create`, and `list_dir` finish in milliseconds, where a verb says nothing and the swap back reads as a flicker. `isActivityKind` is the gate, and a tool without a verb is returned unwrapped.
- **A 150 ms delay before the verb shows.** Even a `grep` can finish in ~20 ms. The timer is cancelled in `finally` if the call returns first, so only genuine waits ever change the label.
- **Why inside `withSerializedExecution`.** This is the load-bearing placement. The serialisation wrapper is outermost and returns `queueExecution(...)` *immediately*, so on a multi-tool step every outer `execute` is entered concurrently and only the inner chain is serialised. Set the activity outside the queue and three parallel greps would race, with the first `finally` clearing the label while two were still running. Inside it, exactly one tool holds the activity at a time — which is what lets `turn-state.ts` keep a plain non-stacked variable instead of a stack.
- **Why outside `withToolRendering`.** So the verb spans the approval prompt too. That costs nothing: the prompt tears the input bar down, so the label is not drawn while it is up, and reappears with the right verb on restore.
- **Sub-agents need no special handling.** `subagents/run-subagent.ts` builds its tools without these wrappers, so a sub-agent's own `grep` never reaches here and `delegating...` stays up for the whole delegation.

## Turn Stop (Esc)

`ToolCallConfirmation.stopTurn` means "deny this call **and** end the turn". Only `cli/tools/tool-approval.ts` sets it, and only for Esc at an interactive approval prompt — a plain Deny, a read-only-mode denial, and scripted mode's `FREECODE_MAX_TOOL_CALLS` cap are ordinary denials that let the turn continue.

The denial itself is nothing special: `withConfirmation` returns the same `Tool call denied by user: …` string — plus one factual sentence, `The user pressed Esc to stop the turn here.` — and flips `stopState.requested` on a `TurnStopState` box shared by every tool from one `createTools()` call. What ends the turn is `withTurnStop`, which sees that flag on the way out and throws `TurnStoppedError` (`util/errors.ts`) carrying that denial text.

That sentence is a **statement, not an instruction**: the turn is over before the model reads it, at the start of the *next* one. It is there because a bare denial is indistinguishable from a plain Deny, whose natural reading is "not *that* call" — so a model mid-task re-proposes the call the user just interrupted. An earlier version phrased it as an instruction ("do not make further tool calls — wait for new instructions") and attached it only to the calls that came *after* the Esc, which is what `docs/bug log/05-08-2026.md` was reported about.

**The throw is the mechanism, and its position is load-bearing:**

- **Why a throw.** The AI SDK takes another step only when *every* tool call in the step produced a result (`ai@3.4` `streamText`: `nextStepType = 'tool-result'` requires `stepToolResults.length === stepToolCalls.length`). A rejected `execute` leaves one without, so the stream finishes gracefully — `finishReason: 'error'`, `responseMessages` resolved — with no further model call. Returning a result instead, as the first design in `docs/bug log/05-08-2026.md` did, always bought one more round trip.
- **Why outside `withToolRendering`.** That layer converts a throw into an `Error: …` result. Wrapping outside it means the denial renders first, exactly like any other denial, and only then does the turn end.
- **Why inside `withSerializedExecution`.** A sibling call already queued behind the stopped one sees `stopState.requested` on entry and throws immediately, without prompting and without running.

The unpaired call the throw leaves behind is re-paired with its denial by `pairStoppedToolCalls` ([../turn-messages.md](../turn-messages.md)) before the turn commits; `agent/stream-turn.ts` recognises the sentinel in the stream's `error` part and reports it as `stopDenials` rather than a failure. The two text-protocol loops (`agent/parsed-tools.ts`, `agent/fake-loop.ts`) catch it in `executeToolCalls` and end their own loop.

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
