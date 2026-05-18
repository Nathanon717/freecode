import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { grepTool } from './grep.js';
import { shellTool } from './shell.js';
import { listDirTool } from './list-dir.js';
import { logError } from '../../logger.js';
import { loadConfig } from '../../config/index.js';
import chalk from 'chalk';
import { z } from 'zod';
import type { CoreTool } from 'ai';
import { existsSync, readFileSync, writeFileSync } from 'fs';

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

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(', ');
}

function toolCall(name: string, args: Record<string, unknown>): void {
  process.stderr.write(chalk.cyan(`${name}(${formatArgs(args)})\n`));
}

function toolError(name: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(chalk.red(`${name}() failed: ${msg}\n`));
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
  } catch {
    // Tracing must never affect the agent run.
  }
}

function formatToolOutput(result: unknown, maxLines = 30): string {
  const raw = typeof result === 'string' ? result : JSON.stringify(result, null, 2) ?? '';
  const trimmed = raw.trimEnd();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  const shown = lines.slice(0, maxLines);
  const indented = shown.map(l => chalk.dim('  ' + l)).join('\n');
  return lines.length > maxLines
    ? indented + chalk.dim(`\n  ... (${lines.length - maxLines} more lines)`)
    : indented;
}

function withLogging(name: string, t: AnyCoreTool): AnyCoreTool {
  if (!t.execute) return t;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = t.execute as (args: any, opts: any) => Promise<any>;
  return {
    ...t,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (args: any, opts: any) => {
      const { rationale, ...displayArgs } = args;
      if (rationale) process.stderr.write(chalk.white(rationale) + '\n');
      toolCall(name, displayArgs);
      try {
        const result = await original(args, opts);
        appendToolTrace({ tool: name, args: displayArgs, result });
        const preview = formatToolOutput(result);
        if (preview) process.stderr.write(preview + '\n');
        return result;
      } catch (err) {
        appendToolTrace({ tool: name, args: displayArgs, error: err instanceof Error ? err.message : String(err) });
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

function wrap(name: string, t: AnyCoreTool, useRationale: boolean, queueExecution: QueuedToolExecution, confirmToolCall?: ConfirmToolCall): AnyCoreTool {
  return withSerializedExecution(
    withLogging(name, withConfirmation(name, useRationale ? withRationale(t) : t, confirmToolCall)),
    queueExecution,
  );
}

const useRationale = loadConfig().toolRationale;

export function createTools(confirmToolCall?: ConfirmToolCall) {
  const queueExecution = createToolExecutionQueue();
  return {
    read_file:  wrap('read_file',  readFileTool,  useRationale, queueExecution, confirmToolCall),
    write_file: wrap('write_file', writeFileTool, useRationale, queueExecution, confirmToolCall),
    grep:       wrap('grep',       grepTool,      useRationale, queueExecution, confirmToolCall),
    shell_exec: wrap('shell_exec', shellTool,     useRationale, queueExecution, confirmToolCall),
    list_dir:   wrap('list_dir',   listDirTool,   useRationale, queueExecution, confirmToolCall),
  };
}

export const allTools = createTools();

export { readFileTool, writeFileTool, grepTool, shellTool, listDirTool };
