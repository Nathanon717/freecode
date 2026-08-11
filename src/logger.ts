/**
 * @role Category-colored stderr logging. Diagnostic logging is disabled by default; errors surface unless FREECODE_SILENCE_ERRORS is set.
 *
 * @readwhen
 * - Adding or renaming a log category color in CATEGORY_COLORS.
 * - Changing the stderr output format, timestamp, or JSON data serialization.
 * - Debugging missing output: enableLog() gates log() but never logError(), whose only gate is FREECODE_SILENCE_ERRORS — set for the unit suite, so expected-error noise stays out of the reporter.
 */

import chalk from 'chalk';

let enabled = false;

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
  process.stderr.write(`${ts} ${tag} ${message}${dataStr}\n`);
}

/**
 * Writes to stderr regardless of `enableLog` state, with the error text and stack.
 *
 * Silent only when `FREECODE_SILENCE_ERRORS` is set, which the unit suite does: dozens of
 * tests drive error paths on purpose, and those writes land on the real stderr rather than
 * vitest's captured one, shredding the dot reporter. Read at call time so a test can delete
 * the variable and exercise the write path.
 */
export function logError(category: string, message: string, err: unknown): void {
  if (process.env.FREECODE_SILENCE_ERRORS) return;
  let errMsg: string;
  if (err instanceof Error) {
    errMsg = err.message;
  } else if (typeof err === 'object' && err !== null) {
    errMsg = JSON.stringify(err);
  } else {
    errMsg = String(err);
  }
  const errStack = err instanceof Error && err.stack ? `\n${chalk.dim(err.stack)}` : '';
  const ts = chalk.dim(`[${timestamp()}]`);
  const tag = chalk.red('[error]');
  process.stderr.write(`${ts} ${tag} [${category}] ${message}: ${chalk.red(errMsg)}${errStack}\n`);
}
