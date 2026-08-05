// The decorator layer every offered tool is built from.
//
// A raw tool (`read.ts`, `create.ts`, …) knows only how to do its own job. What
// turns one into a tool the agent may call is this stack, applied in `wrap`
// below — rationale argument, user confirmation, transcript rendering, turn
// stop, and serialised execution. `index.ts` owns which tools exist and which
// are offered; this file owns what happens around each call.

import { z } from "zod";
import type { CoreTool } from "ai";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { isReadOnlyTool } from "./tool-names.js";
import { logError } from "../../logger.js";
import { toErrorMessage, TurnStoppedError } from "../../util/errors.js";
import { awaitToolRenderGate } from "../tool-render-gate.js";
import {
  computeEditDiffContext,
  editDiffResult,
  type EditDiffContext,
} from "./edit-diff-context.js";
import {
  filterArgs,
  formatArgs,
  getTranscriptRuntimeOptions,
  writeToolCallHeader,
  writeToolResultPreview,
  writeToolStepResult,
  type ToolCallHeaderRows,
  type ToolStepResult,
  type TranscriptRuntimeOptions,
} from "../../cli/render/transcript-renderer.js";
import { getApprovalPreviewRowBudget } from "../../cli/tools/tool-approval.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCoreTool = CoreTool<any, any>;
export type QueuedToolExecution = <T>(task: () => Promise<T>) => Promise<T>;
type ToolExecuteFn = (
  args: Record<string, unknown>,
  opts: unknown,
) => Promise<unknown>;

export interface ToolCallPreview {
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

export interface ToolCallConfirmation {
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

export type ConfirmToolCall = (
  preview: ToolCallPreview,
) => Promise<boolean | ToolCallConfirmation>;

interface ToolTraceEvent {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

function appendToolTrace(event: ToolTraceEvent): void {
  const tracePath = process.env.FREECODE_TRACE_JSON;
  if (!tracePath) return;

  try {
    const existing = existsSync(tracePath)
      ? (JSON.parse(readFileSync(tracePath, "utf-8")) as ToolTraceEvent[])
      : [];
    existing.push(event);
    writeFileSync(tracePath, JSON.stringify(existing, null, 2), "utf-8");
  } catch (err) {
    logError("tool", `Failed to write trace to ${tracePath}`, err);
  }
}

interface PreviewState {
  suppressed: boolean;
  /** Heights of the header (and the preamble above it) withToolRendering just wrote. */
  rowsAbove: ToolCallHeaderRows;
  /**
   * Diff context withToolRendering read from disk for the current edit call, so
   * withConfirmation can render the pending-approval preview without a second read.
   */
  editContext?: EditDiffContext;
}

/**
 * Shared by every tool from one `createTools()` call, so the Esc that denied one
 * call is seen by the wrappers of the calls beside it in the same step.
 */
interface TurnStopState {
  requested: boolean;
}

function withToolRendering(
  name: string,
  t: AnyCoreTool,
  parsedTools = false,
  previewState?: PreviewState,
): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (
      args: Record<string, unknown>,
      opts: unknown,
    ): Promise<unknown> => {
      if (previewState) previewState.suppressed = false;
      // On the native fullStream path, wait until the consumer has flushed this
      // step's streamed text before drawing the header, so the model's pre-tool
      // preamble can't print after the call. No-op on non-streaming paths.
      await awaitToolRenderGate();
      const { rationale, ...displayArgs } = args;
      const rowsAbove = writeToolCallHeader({
        name,
        displayArgs,
        rationale: typeof rationale === "string" ? rationale : undefined,
        parsedTools,
      });
      if (previewState) previewState.rowsAbove = rowsAbove;

      // Read the surrounding-file context for an edit up front so both the
      // pending-approval preview (withConfirmation, via previewState) and the
      // post-execution diff render from the same single disk read.
      let editContext: EditDiffContext | undefined;
      if (name === "edit") {
        editContext = computeEditDiffContext(args.path, args.old_text);
        if (previewState) previewState.editContext = editContext;
      }

      try {
        const result = await original(args, opts);
        appendToolTrace({ tool: name, args: displayArgs, result });
        const editDiff =
          name === "edit" ? editDiffResult(args, editContext) : null;
        let stepResult: ToolStepResult;
        if (editDiff) {
          stepResult = editDiff;
        } else if (
          name === "create" &&
          typeof args.content === "string" &&
          typeof result === "string" &&
          result.startsWith("Wrote ")
        ) {
          stepResult = { kind: "create-content", content: args.content };
        } else {
          stepResult = { kind: "text", result };
        }
        if (!previewState?.suppressed) {
          writeToolStepResult(name, stepResult, getTranscriptRuntimeOptions());
        }
        return result;
      } catch (err) {
        appendToolTrace({
          tool: name,
          args: displayArgs,
          error: toErrorMessage(err),
        });
        writeToolStepResult(
          name,
          { kind: "error", error: err },
          getTranscriptRuntimeOptions(),
        );
        logError("tool", `${name} threw`, err);
        // Return, don't rethrow: a rejected execute produces no tool result, so the
        // model would never learn the call failed and the AI SDK would end the turn
        // (it only continues when every tool call has a result). Handing the message
        // back as the result lets the model see the failure and try something else.
        return `Error: ${toErrorMessage(err)}`;
      }
    },
  };
}

/**
 * Cap the pending-approval preview to the rows left between the approval hint and
 * the content above it, so the call the user is approving — and the model's
 * preamble explaining it — stay on screen instead of scrolling off behind a long
 * result. The overflow is only dropped from the transcript; the model still
 * receives the full result.
 */
function withApprovalRowBudget(
  opts: TranscriptRuntimeOptions,
  rowsAbove: ToolCallHeaderRows,
): TranscriptRuntimeOptions {
  const maxResultRows = getApprovalPreviewRowBudget(rowsAbove);
  return maxResultRows === null ? opts : { ...opts, maxResultRows };
}

/**
 * Ends the turn once a confirmation asked for it, by rejecting instead of
 * resolving.
 *
 * A rejected `execute` produces no tool result, and the AI SDK only takes
 * another step when *every* call in the step has one — so this is what actually
 * stops the model being called again. Deliberately wrapped OUTSIDE
 * `withToolRendering`: the denial is a normal result to that layer, so it prints
 * as `Tool call denied by user: …` exactly like any other denial, and only then
 * does the turn end. The unpaired call this leaves in the SDK's response
 * messages is re-paired with `denialResult` in `agent/turn-messages.ts`.
 */
function withTurnStop(
  name: string,
  t: AnyCoreTool,
  stopState: TurnStopState,
): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (
      args: Record<string, unknown>,
      opts: unknown,
    ): Promise<unknown> => {
      // A sibling call in the same step already stopped the turn. Don't prompt
      // for this one and don't run it: the user asked to stop, and nothing it
      // returned could reach the model anyway. It never renders — no header was
      // written for it — but it still needs a result for history, since the call
      // itself is in the assistant message the model sent.
      if (stopState.requested) {
        throw new TurnStoppedError(
          `Tool call denied by user: ${name} — not run, because the user pressed Esc to stop the turn.`,
        );
      }
      const result = await original(args, opts);
      if (!stopState.requested) return result;
      throw new TurnStoppedError(
        typeof result === "string" ? result : JSON.stringify(result),
      );
    },
  };
}

function withConfirmation(
  name: string,
  t: AnyCoreTool,
  confirmToolCall?: ConfirmToolCall,
  previewState?: PreviewState,
  stopState?: TurnStopState,
): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (
      args: Record<string, unknown>,
      opts: unknown,
    ): Promise<unknown> => {
      const { rationale: _r, ...displayArgs } = args;
      if (!confirmToolCall) {
        return `Tool call denied: ${name} requires user confirmation, but no confirmation handler is available.`;
      }

      let precomputedResult: unknown;
      let hasPrecomputed = false;
      let previewedContent = false;
      let resultText: string | undefined;

      const previewOpts = withApprovalRowBudget(
        getTranscriptRuntimeOptions(),
        previewState?.rowsAbove ?? { header: 0, preamble: 0 },
      );

      if (isReadOnlyTool(name)) {
        precomputedResult = await original(args, opts);
        hasPrecomputed = true;
        if (typeof precomputedResult === "string") resultText = precomputedResult;
        previewedContent = writeToolResultPreview(
          name,
          { kind: "text", result: precomputedResult },
          previewOpts,
        );
      } else if (name === "create" && typeof args.content === "string") {
        previewedContent = writeToolResultPreview(
          name,
          { kind: "create-content", content: args.content },
          previewOpts,
        );
      } else if (name === "edit") {
        // Project the diff the edit would apply, from the context withToolRendering
        // already read from disk — writing is not safe to run pre-confirmation.
        const editDiff = editDiffResult(args, previewState?.editContext);
        if (editDiff) {
          previewedContent = writeToolResultPreview(name, editDiff, previewOpts);
        }
      }

      const confirmation = await confirmToolCall({
        name,
        args: displayArgs,
        previewedContent,
        resultText,
      });
      const approved =
        typeof confirmation === "boolean"
          ? confirmation
          : confirmation.approved;
      if (!approved) {
        const stopTurn = typeof confirmation !== "boolean" && confirmation.stopTurn === true;
        if (stopTurn && stopState) stopState.requested = true;
        const message =
          typeof confirmation === "boolean" ? "" : confirmation.message?.trim();
        const userMessage = message
          ? `\nUser input after denial: ${message}`
          : "";
        // A plain statement of what happened, not an instruction — the turn is
        // already over by the time the model reads it. Without it the model
        // opens the next turn on a denial indistinguishable from a plain Deny,
        // whose natural reading is "not *that* call" — so it re-proposes the
        // call the user just interrupted.
        const stopNote = stopTurn
          ? "\nThe user pressed Esc to stop the turn here."
          : "";
        return `Tool call denied by user: ${name}(${formatArgs(filterArgs(name, displayArgs))})${userMessage}${stopNote}`;
      }

      if (previewedContent && previewState) {
        previewState.suppressed = true;
      }

      if (hasPrecomputed) return precomputedResult;
      return original(args, opts);
    },
  };
}

function withRationale(t: AnyCoreTool): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  const extended = z
    .object({
      rationale: z
        .string()
        .describe(
          "One sentence explaining why you are calling this tool right now.",
        ),
    })
    .merge(t.parameters as z.ZodObject<z.ZodRawShape>);
  return {
    ...t,
    parameters: extended,
    execute: async (
      args: Record<string, unknown>,
      opts: unknown,
    ): Promise<unknown> => {
      const { rationale: _r, ...rest } = args;
      return original(rest, opts);
    },
  };
}

function withSerializedExecution(
  t: AnyCoreTool,
  queueExecution: QueuedToolExecution,
): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (
      args: Record<string, unknown>,
      opts: unknown,
    ): Promise<unknown> => queueExecution(() => original(args, opts)),
  };
}

export function createToolExecutionQueue(): QueuedToolExecution {
  let tail: Promise<void> = Promise.resolve();

  return async <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** One per `createTools()` call — see `TurnStopState`. */
export function createTurnStopState(): TurnStopState {
  return { requested: false };
}

/** Apply the whole stack to one raw tool. */
export function wrap(
  name: string,
  t: AnyCoreTool,
  useRationale: boolean,
  queueExecution: QueuedToolExecution,
  stopState: TurnStopState,
  confirmToolCall?: ConfirmToolCall,
  parsedTools = false,
  requiresConfirmation = true,
): AnyCoreTool {
  const previewState: PreviewState = {
    suppressed: false,
    rowsAbove: { header: 0, preamble: 0 },
  };
  // spawn_agent runs a read-only sub-agent, so it skips confirmation (like the
  // read-only tools) but still renders and serialises. It also skips the rationale
  // wrapper so the model need not supply one to delegate.
  const confirmed = requiresConfirmation
    ? withConfirmation(
        name,
        useRationale ? withRationale(t) : t,
        confirmToolCall,
        previewState,
        stopState,
      )
    : t;
  return withSerializedExecution(
    withTurnStop(
      name,
      withToolRendering(name, confirmed, parsedTools, previewState),
      stopState,
    ),
    queueExecution,
  );
}
