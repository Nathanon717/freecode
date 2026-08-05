import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { projectRoot } from '../workspace.js';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT_MS = 30000;

// exec's own default is 1 MB, which a real `dotnet build` or `npm test` blows
// past — the child is then killed and its output discarded, which is exactly
// the failure this tool exists to report.
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

// What the model is handed. Capturing 10 MB is not the same as sending it: an
// uncapped result would spend the context window on one tool call. Kept as a
// head+tail window because a failing build puts the first diagnostics at the top
// and the summary at the bottom, and the elision is always stated — never a
// silent drop, which is the whole bug this file is fixing.
const MAX_RESULT_CHARS = 100_000;
const HEAD_CHARS = 60_000;
const TAIL_CHARS = MAX_RESULT_CHARS - HEAD_CHARS;

// The shape `child_process.exec` rejects with. stdout/stderr hold whatever the
// command produced before it failed; `message` only ever carries stderr, so a
// catch block that returns `message` alone silently drops stdout.
interface ExecFailure {
  stdout?: string;
  stderr?: string;
  code?: number | string;
  killed?: boolean;
  message?: string;
}

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bdel\b/i,
  /\bformat\b\s+[a-z]:/i,
  /\bgit\s+reset\b/i,
  /\bgit\s+clean\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+pull\b/i,
  /\bmove-item\b/i,
  /\bremove-item\b/i,
  /\bset-content\b/i,
  /\bnew-item\b/i,
  /\bren(?:ame)?\b/i,
];

export const isDestructiveCommand = (command: string): boolean => {
  return DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));
};

const elide = (text: string): string => {
  if (text.length <= MAX_RESULT_CHARS) return text;
  const dropped = text.length - MAX_RESULT_CHARS;
  return (
    text.slice(0, HEAD_CHARS) +
    `\n[... ${dropped} characters elided: first ${HEAD_CHARS} and last ${TAIL_CHARS} kept ...]\n` +
    text.slice(text.length - TAIL_CHARS)
  );
};

const join = (result: string, addition: string): string =>
  result + (result === '' || result.endsWith('\n') ? '' : '\n') + addition;

/**
 * The model gets the command's real bytes and nothing else, plus a trailing
 * status line for the news that is *not* in those bytes. Exit status is one of
 * those: `dotnet build` prints its errors to stdout and exits 1, while plenty
 * of commands print alarming text and exit 0, so output alone cannot be read
 * as success or failure. A clean `exit 0` with output needs no line — the
 * output speaks for itself.
 */
const composeResult = (stdout: string, stderr: string, status: string | null): string => {
  let result = stdout;
  if (stderr) result = join(result, '[stderr]: ' + stderr);
  result = elide(result);
  // The status line is appended after elision so it can never be the thing
  // dropped — it is the one part of the result the output cannot restate.
  return status ? join(result, status) : result;
};

const failureStatus = (failure: ExecFailure, timeoutMs: number): string => {
  if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return `[output exceeded ${MAX_OUTPUT_BYTES} bytes: command killed, output above is truncated]`;
  }
  // exec SIGTERMs the child on timeout; partial output still reaches us.
  if (failure.killed) {
    return `[timed out after ${timeoutMs}ms: command killed, output above may be partial]`;
  }
  if (typeof failure.code === 'number') return `[exit ${failure.code}]`;
  // The shell never ran the command, so there is no output to speak for itself.
  return `[command did not run: ${failure.message ?? 'unknown error'}]`;
};

export const shellTool = tool({
  description: 'Execute a shell command. Use this to run build scripts, git commands, npm install, etc.',
  parameters: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout_ms: z.number().int().positive().optional().describe('Maximum command runtime in milliseconds (default: 30000)'),
    confirmDestructive: z.boolean().optional().describe('Set to true only if user confirmed destructive command'),
  }),
  execute: async ({ command, timeout_ms, confirmDestructive }) => {
    if (isDestructiveCommand(command) && !confirmDestructive) {
      return 'Destructive command detected. Set confirmDestructive: true if user confirmed.';
    }
    const timeoutMs = timeout_ms ?? DEFAULT_TIMEOUT_MS;
    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        cwd: projectRoot,
      });
      // A bare empty result would be ambiguous with a failure that printed
      // nothing, so success-with-no-output says so.
      return composeResult(stdout, stderr, stdout || stderr ? null : '[exit 0, no output]');
    } catch (error) {
      const failure = (error ?? {}) as ExecFailure;
      return composeResult(
        failure.stdout ?? '',
        failure.stderr ?? '',
        failureStatus(failure, timeoutMs),
      );
    }
  },
});
