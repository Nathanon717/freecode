import { readFileTool } from './read.js';
import { createTool } from './create.js';
import { editTool } from './edit.js';
import { grepTool } from './grep.js';
import { shellTool } from './shell.js';
import { listDirTool } from './list-dir.js';
import { logError } from '../../logger.js';
import { loadConfig } from '../../config/index.js';
import { isUserAbortError, toErrorMessage } from '../../util/errors.js';
import { z } from 'zod';
import type { CoreTool } from 'ai';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  filterArgs,
  formatArgs,
  getTranscriptRuntimeOptions,
  writeToolCallHeader,
  writeToolStepResult,
  type ToolStepResult,
} from '../../cli/transcript-renderer.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCoreTool = CoreTool<any, any>;
type QueuedToolExecution = <T>(task: () => Promise<T>) => Promise<T>;
type ToolExecuteFn = (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;

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

export { formatArgs, filterArgs } from '../../cli/transcript-renderer.js';

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
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (args: Record<string, unknown>, opts: unknown): Promise<unknown> => {
      const { rationale, ...displayArgs } = args;
      writeToolCallHeader({
        name,
        displayArgs,
        rationale: typeof rationale === 'string' ? rationale : undefined,
        promptTools,
      });

      const editContextBefore: string[] = [];
      const editContextAfter: string[] = [];
      let editLineIndent = '';
      if (name === 'edit' && typeof args.path === 'string' && typeof args.old_text === 'string') {
        try {
          const filePath = join(process.cwd(), args.path);
          if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
            const normalizedOld = args.old_text
              .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\r\n/g, '\n');
            const idx = content.indexOf(normalizedOld);
            if (idx !== -1) {
              const beforeParts = content.slice(0, idx).split('\n');
              const partialLineStart = beforeParts.pop() ?? '';
              if (/^\s+$/.test(partialLineStart)) editLineIndent = partialLineStart;
              const maxCtx = loadConfig().diffContextLines;
              for (let i = beforeParts.length - 1; i >= 0 && editContextBefore.length < maxCtx; i--) {
                if (/^\s*$/.test(beforeParts[i])) break;
                editContextBefore.unshift(beforeParts[i]);
              }
              const afterParts = content.slice(idx + normalizedOld.length).split('\n');
              afterParts.shift();
              for (let i = 0; i < afterParts.length && editContextAfter.length < maxCtx; i++) {
                if (/^\s*$/.test(afterParts[i])) break;
                editContextAfter.push(afterParts[i]);
              }
            }
          }
        } catch { /* gracefully degrade to no context */ }
      }

      try {
        const result = await original(args, opts);
        appendToolTrace({ tool: name, args: displayArgs, result });
        let stepResult: ToolStepResult;
        if (name === 'edit' && typeof args.path === 'string' && typeof args.old_text === 'string' && typeof args.new_text === 'string') {
          stepResult = {
            kind: 'edit-diff',
            path: args.path,
            oldText: args.old_text,
            newText: args.new_text,
            contextBefore: editContextBefore,
            contextAfter: editContextAfter,
            lineIndent: editLineIndent,
          };
        } else if (name === 'create' && typeof args.content === 'string' && typeof result === 'string' && result.startsWith('Wrote ')) {
          stepResult = { kind: 'create-content', content: args.content };
        } else {
          stepResult = { kind: 'text', result };
        }
        writeToolStepResult(name, stepResult, getTranscriptRuntimeOptions());
        return result;
      } catch (err) {
        if (isUserAbortError(err)) throw err;
        appendToolTrace({ tool: name, args: displayArgs, error: toErrorMessage(err) });
        writeToolStepResult(name, { kind: 'error', error: err }, getTranscriptRuntimeOptions());
        logError('tool', `${name} threw`, err);
        throw err;
      }
    },
  };
}

function withConfirmation(name: string, t: AnyCoreTool, confirmToolCall?: ConfirmToolCall): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (args: Record<string, unknown>, opts: unknown): Promise<unknown> => {
      const { rationale: _r, ...displayArgs } = args;
      if (!confirmToolCall) {
        return `Tool call denied: ${name} requires user confirmation, but no confirmation handler is available.`;
      }
      const confirmation = await confirmToolCall({ name, args: displayArgs });
      const approved = typeof confirmation === 'boolean' ? confirmation : confirmation.approved;
      if (!approved) {
        const message = typeof confirmation === 'boolean' ? '' : confirmation.message?.trim();
        const userMessage = message ? `\nUser input after denial: ${message}` : '';
        return `Tool call denied by user: ${name}(${formatArgs(filterArgs(name, displayArgs))})${userMessage}`;
      }
      return original(args, opts);
    },
  };
}

function withRationale(t: AnyCoreTool): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  const extended = z.object({ rationale: z.string().describe('One sentence: why you are calling this tool right now') }).merge(t.parameters as z.ZodObject<z.ZodRawShape>);
  return {
    ...t,
    parameters: extended,
    execute: async (args: Record<string, unknown>, opts: unknown): Promise<unknown> => {
      const { rationale: _r, ...rest } = args;
      return original(rest, opts);
    },
  };
}

function withSerializedExecution(t: AnyCoreTool, queueExecution: QueuedToolExecution): AnyCoreTool {
  if (!t.execute) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (args: Record<string, unknown>, opts: unknown): Promise<unknown> => queueExecution(() => original(args, opts)),
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

export function createTools(confirmToolCall?: ConfirmToolCall, toolRationale?: boolean, promptTools = false, readOnly = false) {
  const useRationale = toolRationale ?? loadConfig().toolRationale;
  const queueExecution = createToolExecutionQueue();
  const readOnlyTools = {
    read:     wrap('read',     readFileTool, useRationale, queueExecution, confirmToolCall, promptTools),
    grep:      wrap('grep',      grepTool,     useRationale, queueExecution, confirmToolCall, promptTools),
    list_dir:  wrap('list_dir',  listDirTool,  useRationale, queueExecution, confirmToolCall, promptTools),
  };
  if (readOnly) return readOnlyTools;
  return {
    ...readOnlyTools,
    create:     wrap('create',     createTool,    useRationale, queueExecution, confirmToolCall, promptTools),
    edit:       wrap('edit',       editTool,      useRationale, queueExecution, confirmToolCall, promptTools),
    shell_exec: wrap('shell_exec', shellTool,     useRationale, queueExecution, confirmToolCall, promptTools),
  };
}

export const allTools = createTools();

export { readFileTool, createTool, editTool, grepTool, shellTool, listDirTool };
