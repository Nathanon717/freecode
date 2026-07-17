import { readFileTool } from "./read.js";
import { createFileTool } from "./create.js";
import { editTool } from "./edit.js";
import { grepTool } from "./grep.js";
import { shellTool } from "./shell.js";
import { listDirTool } from "./list-dir.js";
import { logError } from "../../logger.js";
import { loadConfig } from "../../config/index.js";
import { isUserAbortError, toErrorMessage } from "../../util/errors.js";
import { z } from "zod";
import type { CoreTool } from "ai";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { awaitToolRenderGate } from "../tool-render-gate.js";
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
} from "../../cli/transcript-renderer.js";
import { getApprovalPreviewRowBudget } from "../../cli/tool-approval.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCoreTool = CoreTool<any, any>;
type QueuedToolExecution = <T>(task: () => Promise<T>) => Promise<T>;
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
}

export interface ToolCallConfirmation {
  approved: boolean;
  message?: string;
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

      const editContextBefore: string[] = [];
      const editContextAfter: string[] = [];
      let editLineIndent = "";
      if (
        name === "edit" &&
        typeof args.path === "string" &&
        typeof args.old_text === "string"
      ) {
        try {
          const filePath = join(process.cwd(), args.path);
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, "utf-8").replace(
              /\r\n/g,
              "\n",
            );
            const normalizedOld = args.old_text
              .replace(/\\n/g, "\n")
              .replace(/\\t/g, "\t")
              .replace(/\r\n/g, "\n");
            const idx = content.indexOf(normalizedOld);
            if (idx !== -1) {
              const beforeParts = content.slice(0, idx).split("\n");
              const partialLineStart = beforeParts.pop() ?? "";
              if (/^\s+$/.test(partialLineStart))
                editLineIndent = partialLineStart;
              const maxCtx = loadConfig().diffContextLines;
              for (
                let i = beforeParts.length - 1;
                i >= 0 && editContextBefore.length < maxCtx;
                i--
              ) {
                if (/^\s*$/.test(beforeParts[i])) break;
                editContextBefore.unshift(beforeParts[i]);
              }
              const afterParts = content
                .slice(idx + normalizedOld.length)
                .split("\n");
              afterParts.shift();
              for (
                let i = 0;
                i < afterParts.length && editContextAfter.length < maxCtx;
                i++
              ) {
                if (/^\s*$/.test(afterParts[i])) break;
                editContextAfter.push(afterParts[i]);
              }
            }
          }
        } catch {
          /* gracefully degrade to no context */
        }
      }

      try {
        const result = await original(args, opts);
        appendToolTrace({ tool: name, args: displayArgs, result });
        let stepResult: ToolStepResult;
        if (
          name === "edit" &&
          typeof args.path === "string" &&
          typeof args.old_text === "string" &&
          typeof args.new_text === "string"
        ) {
          stepResult = {
            kind: "edit-diff",
            path: args.path,
            oldText: args.old_text,
            newText: args.new_text,
            contextBefore: editContextBefore,
            contextAfter: editContextAfter,
            lineIndent: editLineIndent,
          };
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
        if (isUserAbortError(err)) throw err;
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
        throw err;
      }
    },
  };
}

// Tools whose read-only local action is safe to run before the user confirms —
// the preview shown in the approval UI is the actual result, reused on approval
// instead of re-executing. Never add a tool here that has a side effect beyond
// reading (e.g. shell_exec, edit) — the approval UI would then act before consent.
const PRECOMPUTE_BEFORE_CONFIRM = new Set(["read", "grep", "list_dir"]);

interface PreviewState {
  suppressed: boolean;
  /** Heights of the header (and the preamble above it) withToolRendering just wrote. */
  rowsAbove: ToolCallHeaderRows;
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

function withConfirmation(
  name: string,
  t: AnyCoreTool,
  confirmToolCall?: ConfirmToolCall,
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
      const { rationale: _r, ...displayArgs } = args;
      if (!confirmToolCall) {
        return `Tool call denied: ${name} requires user confirmation, but no confirmation handler is available.`;
      }

      let precomputedResult: unknown;
      let hasPrecomputed = false;
      let previewedContent = false;

      const previewOpts = withApprovalRowBudget(
        getTranscriptRuntimeOptions(),
        previewState?.rowsAbove ?? { header: 0, preamble: 0 },
      );

      if (PRECOMPUTE_BEFORE_CONFIRM.has(name)) {
        precomputedResult = await original(args, opts);
        hasPrecomputed = true;
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
      }

      const confirmation = await confirmToolCall({
        name,
        args: displayArgs,
        previewedContent,
      });
      const approved =
        typeof confirmation === "boolean"
          ? confirmation
          : confirmation.approved;
      if (!approved) {
        const message =
          typeof confirmation === "boolean" ? "" : confirmation.message?.trim();
        const userMessage = message
          ? `\nUser input after denial: ${message}`
          : "";
        return `Tool call denied by user: ${name}(${formatArgs(filterArgs(name, displayArgs))})${userMessage}`;
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

function createToolExecutionQueue(): QueuedToolExecution {
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

function wrap(
  name: string,
  t: AnyCoreTool,
  useRationale: boolean,
  queueExecution: QueuedToolExecution,
  confirmToolCall?: ConfirmToolCall,
  parsedTools = false,
): AnyCoreTool {
  const previewState: PreviewState = {
    suppressed: false,
    rowsAbove: { header: 0, preamble: 0 },
  };
  return withSerializedExecution(
    withToolRendering(
      name,
      withConfirmation(
        name,
        useRationale ? withRationale(t) : t,
        confirmToolCall,
        previewState,
      ),
      parsedTools,
      previewState,
    ),
    queueExecution,
  );
}

export function createTools(
  confirmToolCall?: ConfirmToolCall,
  toolRationale?: boolean,
  parsedTools = false,
  readOnly = false,
) {
  const useRationale = toolRationale ?? loadConfig().toolRationale;
  const queueExecution = createToolExecutionQueue();
  const readOnlyTools = {
    read: wrap(
      "read",
      readFileTool,
      useRationale,
      queueExecution,
      confirmToolCall,
      parsedTools,
    ),
    grep: wrap(
      "grep",
      grepTool,
      useRationale,
      queueExecution,
      confirmToolCall,
      parsedTools,
    ),
    list_dir: wrap(
      "list_dir",
      listDirTool,
      useRationale,
      queueExecution,
      confirmToolCall,
      parsedTools,
    ),
  };
  if (readOnly) return readOnlyTools;
  return {
    ...readOnlyTools,
    create: wrap(
      "create",
      createFileTool,
      useRationale,
      queueExecution,
      confirmToolCall,
      parsedTools,
    ),
    edit: wrap(
      "edit",
      editTool,
      useRationale,
      queueExecution,
      confirmToolCall,
      parsedTools,
    ),
    shell_exec: wrap(
      "shell_exec",
      shellTool,
      useRationale,
      queueExecution,
      confirmToolCall,
      parsedTools,
    ),
  };
}

export { readFileTool, createFileTool, editTool, grepTool, shellTool, listDirTool };
