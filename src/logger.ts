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

export function log(category: string, message: string, data?: unknown): void {
  if (!enabled) return;
  const color = CATEGORY_COLORS[category] ?? chalk.white;
  const ts = chalk.dim(`[${timestamp()}]`);
  const tag = color(`[${category}]`);
  const dataStr = data !== undefined ? chalk.dim('  ' + JSON.stringify(data)) : '';
  process.stderr.write(`${ts} ${tag} ${message}${dataStr}\n`);
}

export function logError(category: string, message: string, err: unknown): void {
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
