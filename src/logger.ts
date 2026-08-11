/**
 * @role Category-colored diagnostic logging, to stderr by default or to whatever sink the entrypoint registers. Diagnostic logging is off by default; warnings and errors surface unless FREECODE_SILENCE_ERRORS is set.
 *
 * @readwhen
 * - Adding or renaming a category color in CATEGORY_COLORS, or changing the line format, timestamp, or JSON data serialization.
 * - Debugging missing output: enableLog() gates log() but never logError()/logWarn(), whose only gate is FREECODE_SILENCE_ERRORS — set for the unit suite, so expected-error noise stays out of the reporter.
 * - Chasing log lines that land on top of the TUI: every write goes through the registered sink (see `cli/tui-log-sink.ts`), and falls back to raw stderr only when none is registered.
 */

import chalk from 'chalk';

let enabled = false;

/** Receives one fully-formatted, newline-terminated line. */
export type LogSink = (line: string) => void;

let sink: LogSink | null = null;

/**
 * Redirects every log line to `fn` instead of raw stderr; pass null to restore stderr.
 *
 * Background work logs at arbitrary moments — DB persists, model prefetch, retries — and
 * a raw stderr write lands wherever the cursor happens to be parked, which mid-session is
 * inside the bottom UI's input frame. The interactive entrypoint registers a sink that
 * writes into the scroll region instead.
 */
export function registerLogSink(fn: LogSink | null): void {
  sink = fn;
}

function emit(line: string): void {
  if (sink) sink(line);
  else process.stderr.write(line);
}

export function enableLog() {
  enabled = true;
}

const CATEGORY_COLORS: Record<string, (s: string) => string> = {
  config: chalk.yellow,
  ollama: chalk.magenta,
  router: chalk.cyan,
  stream: chalk.blue,
  tool:   chalk.green,
  db:     chalk.gray,
  quota:  chalk.yellow,
  error:  chalk.red,
};

function timestamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

/** Emits only after `enableLog()` (the `-log` startup flag); a no-op otherwise. */
export function log(category: string, message: string, data?: unknown): void {
  if (!enabled) return;
  const color = CATEGORY_COLORS[category] ?? chalk.white;
  const ts = chalk.dim(`[${timestamp()}]`);
  const tag = color(`[${category}]`);
  const dataStr = data !== undefined ? chalk.dim('  ' + JSON.stringify(data)) : '';
  emit(`${ts} ${tag} ${message}${dataStr}\n`);
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) return JSON.stringify(err);
  return String(err);
}

/**
 * Emits regardless of `enableLog` state, with the error text and stack.
 *
 * Silent only when `FREECODE_SILENCE_ERRORS` is set, which the unit suite does: dozens of
 * tests drive error paths on purpose, and those writes land on the real stderr rather than
 * vitest's captured one, shredding the dot reporter. Read at call time so a test can delete
 * the variable and exercise the write path.
 */
export function logError(category: string, message: string, err: unknown): void {
  if (process.env.FREECODE_SILENCE_ERRORS) return;
  const errStack = err instanceof Error && err.stack ? `\n${chalk.dim(err.stack)}` : '';
  const ts = chalk.dim(`[${timestamp()}]`);
  const tag = chalk.red('[error]');
  emit(`${ts} ${tag} [${category}] ${message}: ${chalk.red(describeError(err))}${errStack}\n`);
}

/**
 * A handled fallback, not a failure: same always-on gating as `logError`, but one line and
 * no stack. Use it where the catch already has a working answer and the throw site is our
 * own code, so the stack says nothing the message doesn't — a dumped trace there is pure
 * noise, and mid-session it is noise measured in screenfuls.
 */
export function logWarn(category: string, message: string, err: unknown): void {
  if (process.env.FREECODE_SILENCE_ERRORS) return;
  const ts = chalk.dim(`[${timestamp()}]`);
  const tag = chalk.yellow('[warn]');
  emit(`${ts} ${tag} [${category}] ${message}: ${chalk.yellow(describeError(err))}\n`);
}
