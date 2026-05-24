import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, loadConfig, readRawConfig, writeConfigFile } from '../config/index.js';
import type { Config } from '../providers/types.js';

// ── Setting definitions ───────────────────────────────────────────────────────

type BoolKey = 'toolRationale' | 'showProviderUsage';

interface BoolSetting {
  type: 'boolean';
  key: BoolKey;
  label: string;
  description: string;
  disabledWhen?: (values: Record<string, unknown>) => boolean;
}

// Extend this union when adding list/string settings.
type Setting = BoolSetting;

const SETTINGS: Setting[] = [
  { type: 'boolean', key: 'toolRationale', label: 'Tool rationale', description: 'Ask model to explain each tool call before executing' },
  { type: 'boolean', key: 'showProviderUsage', label: 'Provider usage', description: 'Print token/rate-limit usage from the provider after each turn' },
];

// ── Rendering ─────────────────────────────────────────────────────────────────

const LABEL_W = 20;

function renderValue(setting: Setting, value: unknown, selected: boolean, disabled: boolean): string {
  if (setting.type === 'boolean') {
    const on = value as boolean;
    if (disabled) {
      return chalk.dim(on ? 'true' : 'false');
    }
    if (selected) {
      const t = on  ? chalk.green.bold('true')  : chalk.dim('true');
      const f = !on ? chalk.red.bold('false') : chalk.dim('false');
      return `${chalk.dim('←')} ${f}  ${t} ${chalk.dim('→')}`;
    }
    return on ? chalk.green('true') : chalk.red('false');
  }
  return String(value);
}

function buildScreen(values: Record<string, unknown>, sel: number, globalPath: string): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('freecode config')}`);
  lines.push(`  ${chalk.dim(globalPath)}`);
  lines.push('');

  for (let i = 0; i < SETTINGS.length; i++) {
    const s = SETTINGS[i];
    const active   = i === sel;
    const disabled = s.type === 'boolean' && !!s.disabledWhen?.(values);
    const cursor = active ? chalk.cyan('▶') : ' ';
    const label  = disabled
      ? chalk.dim(s.label.padEnd(LABEL_W))
      : active ? chalk.bold(s.label.padEnd(LABEL_W)) : chalk.reset(s.label.padEnd(LABEL_W));
    const value  = renderValue(s, values[s.key], active && !disabled, disabled);
    const desc   = chalk.dim(s.description);
    // Pad plain value so description column is stable when row is not selected.
    const valuePad = (active && !disabled) ? value : value.padEnd(5);
    lines.push(`  ${cursor} ${label}  ${valuePad}   ${desc}`);
  }

  lines.push('');
  lines.push(`  ${chalk.dim('↑ ↓  select     ← →  toggle     q  exit')}`);
  lines.push('');
  return lines;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveSetting(globalPath: string, key: string, value: unknown): void {
  const existing = (readRawConfig(globalPath) as Record<string, unknown>) ?? {};
  delete existing['preferLocal'];
  existing[key] = value;
  writeConfigFile(globalPath, existing as Partial<Config>);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runConfigCommand(rl: Interface): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('Config editor requires an interactive terminal.'));
    return;
  }

  const paths      = getConfigPaths();
  const effective  = loadConfig();

  // Seed in-memory values from the effective (merged) config.
  const values: Record<string, unknown> = {};
  for (const s of SETTINGS) {
    values[s.key] = effective[s.key as keyof Config];
  }

  let sel      = 0;
  let rowCount = 0;

  // Count the terminal rows a rendered line occupies, accounting for wrapping
  // of its visible (ANSI-stripped) width against the current terminal width.
  function renderedRows(lines: string[]): number {
    const cols = process.stdout.columns || 80;
    let total = 0;
    for (const line of lines) {
      const visible = line.replace(/\x1b\[[0-9;]*m/g, '').length;
      total += Math.max(1, Math.ceil(visible / cols));
    }
    return total;
  }

  function redraw(): void {
    const lines = buildScreen(values, sel, paths.globalPath);
    if (rowCount > 0) {
      // Move cursor up, go to column 1, clear to end of screen.
      process.stdout.write(`\x1b[${rowCount}A\r\x1b[J`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    rowCount = renderedRows(lines);
  }

  return new Promise<void>((resolve) => {
    // Hand off stdin from readline to us.
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdout.write('\x1b[?25l'); // hide cursor

    redraw();

    const onData = (data: string): void => {
      const setting = SETTINGS[sel];

      if (data === '\x03') {                  // Ctrl+C — hard exit
        cleanup();
        process.exit(0);
      }

      if (data === 'q' || data === 'Q' || data === '\x1b') {
        cleanup();
        resolve();
        return;
      }

      if (data === '\x1b[A') {               // up arrow
        sel = (sel - 1 + SETTINGS.length) % SETTINGS.length;
        redraw();
        return;
      }

      if (data === '\x1b[B') {               // down arrow
        sel = (sel + 1) % SETTINGS.length;
        redraw();
        return;
      }

      if (data === '\x1b[C' || data === '\x1b[D' || data === ' ' || data === '\r') {
        // right / left / space / enter → toggle boolean, cycle list
        if (setting.type === 'boolean') {
          const disabled = !!setting.disabledWhen?.(values);
          if (!disabled) {
            values[setting.key] = !(values[setting.key] as boolean);
            saveSetting(paths.globalPath, setting.key, values[setting.key]);
            redraw();
          }
        }
        return;
      }
    };

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (rowCount > 0) process.stdout.write(`\x1b[${rowCount}A\r\x1b[J`);
      process.stdout.write('\x1b[?25h');
      rl.resume();
    }

    process.stdin.on('data', onData);
  });
}
