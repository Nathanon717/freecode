import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { grepTool } from './grep.js';
import { shellTool } from './shell.js';
import { listDirTool } from './list-dir.js';
import { logError } from '../../logger.js';
import { loadConfig } from '../../config/index.js';
import { isUserAbortError, toErrorMessage } from '../../util/errors.js';
import chalk from 'chalk';
import { z } from 'zod';
import type { CoreTool } from 'ai';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import {
  formatArgs,
  formatPromptToolCallLine,
  formatToolCallLine,
  formatToolErrorLine,
  formatToolResultPreview,
  getTranscriptRuntimeOptions,
  getTranscriptStream,
} from '../../cli/transcript-renderer.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCoreTool = CoreTool<any, any>;
type QueuedToolExecution = <T>(task: () => Promise<T>) => Promise<T>;

export interface ToolCallPreview {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallConfirmation {
  approved: boolean;
  message?: string;
}

export type ConfirmToolCall = (preview: ToolCallPreview) => Promise<boolean | ToolCallConfirmation>;

interface ToolTraceEvent {
  tool: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export { formatArgs } from '../../cli/transcript-renderer.js';

function toolOut(): NodeJS.WritableStream {
  return getTranscriptStream();
}

function toolCall(name: string, args: Record<string, unknown>): void {
  toolOut().write(formatToolCallLine(name, args) + '\n');
}

function toolError(name: string, err: unknown): void {
  toolOut().write(formatToolErrorLine(name, err) + '\n');
}

function appendToolTrace(event: ToolTraceEvent): void {
  const tracePath = process.env.FREECODE_TRACE_JSON;
  if (!tracePath) return;

  try {
    const existing = existsSync(tracePath)
      ? JSON.parse(readFileSync(tracePath, 'utf-8')) as ToolTraceEvent[]
      : [];
    existing.push(event);
    writeFileSync(tracePath, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    logError('tool', `Failed to write trace to ${tracePath}`, err);
  }
}

function withLogging(name: string, t: AnyCoreTool, promptTools = false): AnyCoreTool {
  if (!t.execute) return t;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = t.execute as (args: any, opts: any) => Promise<any>;
  return {
    ...t,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (args: any, opts: any) => {
      const { rationale, ...displayArgs } = args;
      if (rationale) toolOut().write('\n' + chalk.cyan(rationale) + '\n');
      const callLine = promptTools
        ? formatPromptToolCallLine(name, displayArgs)
        : formatToolCallLine(name, displayArgs);
      toolOut().write(callLine + '\n');
      try {
        const result = await original(args, opts);
        appendToolTrace({ tool: name, args: displayArgs, result });
        const preview = formatToolResultPreview(result, getTranscriptRuntimeOptions());
        if (preview) toolOut().write(preview + '\n');
        return result;
      } catch (err) {
        if (isUserAbortError(err)) throw err;
        appendToolTrace({ tool: name, args: displayArgs, error: toErrorMessage(err) });
        toolError(name, err);
        logError('tool', `${name} threw`, err);
        throw err;
      }
    },
  };
}

function withConfirmation(name: string, t: AnyCoreTool, confirmToolCall?: ConfirmToolCall): AnyCoreTool {
  if (!t.execute) return t;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = t.execute as (args: any, opts: any) => Promise<any>;
  return {
    ...t,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (args: any, opts: any) => {
      const { rationale: _r, ...displayArgs } = args;
      if (!confirmToolCall) {
        return `Tool call denied: ${name} requires user confirmation, but no confirmation handler is available.`;
      }
      const confirmation = await confirmToolCall({ name, args: displayArgs });
      const approved = typeof confirmation === 'boolean' ? confirmation : confirmation.approved;
      if (!approved) {
        const message = typeof confirmation === 'boolean' ? '' : confirmation.message?.trim();
        const userMessage = message ? `\nUser input after denial: ${message}` : '';
        return `Tool call denied by user: ${name}(${formatArgs(displayArgs)})${userMessage}`;
      }
      return original(args, opts);
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withRationale(t: AnyCoreTool): AnyCoreTool {
  if (!t.execute) return t;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = t.execute as (args: any, opts: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extended = z.object({ rationale: z.string().describe('One sentence: why you are calling this tool right now') }).merge(t.parameters as z.ZodObject<z.ZodRawShape>);
  return {
    ...t,
    parameters: extended,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (args: any, opts: any) => {
      const { rationale: _r, ...rest } = args;
      return original(rest, opts);
    },
  };
}

function withSerializedExecution(t: AnyCoreTool, queueExecution: QueuedToolExecution): AnyCoreTool {
  if (!t.execute) return t;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = t.execute as (args: any, opts: any) => Promise<any>;
  return {
    ...t,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (args: any, opts: any) => queueExecution(() => original(args, opts)),
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

function wrap(name: string, t: AnyCoreTool, useRationale: boolean, queueExecution: QueuedToolExecution, confirmToolCall?: ConfirmToolCall, promptTools = false): AnyCoreTool {
  return withSerializedExecution(
    withLogging(name, withConfirmation(name, useRationale ? withRationale(t) : t, confirmToolCall), promptTools),
    queueExecution,
  );
}

export function createTools(confirmToolCall?: ConfirmToolCall, toolRationale?: boolean, promptTools = false) {
  const useRationale = toolRationale ?? loadConfig().toolRationale;
  const queueExecution = createToolExecutionQueue();
  return {
    read_file:  wrap('read_file',  readFileTool,  useRationale, queueExecution, confirmToolCall, promptTools),
    write_file: wrap('write_file', writeFileTool, useRationale, queueExecution, confirmToolCall, promptTools),
    edit_file:  wrap('edit_file',  editFileTool,  useRationale, queueExecution, confirmToolCall, promptTools),
    grep:       wrap('grep',       grepTool,      useRationale, queueExecution, confirmToolCall, promptTools),
    shell_exec: wrap('shell_exec', shellTool,     useRationale, queueExecution, confirmToolCall, promptTools),
    list_dir:   wrap('list_dir',   listDirTool,   useRationale, queueExecution, confirmToolCall, promptTools),
  };
}

export const allTools = createTools();

export { readFileTool, writeFileTool, editFileTool, grepTool, shellTool, listDirTool };
