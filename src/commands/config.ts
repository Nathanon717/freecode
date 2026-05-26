import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, loadConfig, readRawConfig, resolveModelSettings, writeConfigFile } from '../config/index.js';
import type { Config, OverridableSettings } from '../providers/types.js';

// ── Setting definitions ───────────────────────────────────────────────────────

type OverridableKey = keyof OverridableSettings;

interface BoolSetting {
  type: 'boolean';
  key: OverridableKey;
  label: string;
  description: string;
}

type Setting = BoolSetting;

const SETTINGS: Setting[] = [
  { type: 'boolean', key: 'toolRationale',    label: 'Tool rationale',   description: 'Ask model to explain each tool call before executing' },
  { type: 'boolean', key: 'showProviderUsage', label: 'Provider usage',   description: 'Print token/rate-limit usage from the provider after each turn' },
  { type: 'boolean', key: 'parallelTools',     label: 'Parallel tools',   description: 'Allow model to call multiple tools in the same response' },
];

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'global' | 'provider' | 'model';

function getProviderId(model: string): string {
  const idx = model.indexOf(':');
  return idx !== -1 ? model.slice(0, idx) : '';
}

function getAvailableTabs(currentModel: string): Tab[] {
  if (!currentModel || !currentModel.includes(':')) return ['global'];
  return ['global', 'provider', 'model'];
}

// ── Value loading ─────────────────────────────────────────────────────────────

// Global tab: boolean. Provider/Model tabs: boolean | undefined (undefined = inherit from parent).
type TabValue = boolean | undefined;

function loadGlobalValues(): Record<string, boolean> {
  const cfg = loadConfig();
  const vals: Record<string, boolean> = {};
  for (const s of SETTINGS) vals[s.key] = cfg[s.key as keyof Config] as boolean;
  return vals;
}

function loadOverrideValues(tab: Tab, currentModel: string, globalPath: string): Record<string, TabValue> {
  const raw = (readRawConfig(globalPath) as Record<string, unknown>) ?? {};
  const providerId = getProviderId(currentModel);
  const vals: Record<string, TabValue> = {};

  let overrides: Record<string, unknown> = {};
  if (tab === 'provider' && providerId) {
    overrides = ((raw.providerOverrides as Record<string, unknown>)?.[providerId] as Record<string, unknown>) ?? {};
  } else if (tab === 'model' && currentModel) {
    overrides = ((raw.modelOverrides as Record<string, unknown>)?.[currentModel] as Record<string, unknown>) ?? {};
  }

  for (const s of SETTINGS) {
    const v = overrides[s.key];
    vals[s.key] = typeof v === 'boolean' ? v : undefined;
  }
  return vals;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const LABEL_W = 20;

function renderGlobalValue(value: boolean, selected: boolean): string {
  if (selected) {
    const t = value  ? chalk.green.bold('true')  : chalk.dim('true');
    const f = !value ? chalk.red.bold('false') : chalk.dim('false');
    return `${chalk.dim('←')} ${f}  ${t} ${chalk.dim('→')}`;
  }
  return value ? chalk.green('true') : chalk.red('false');
}

function renderOverrideValue(value: TabValue, effectiveValue: boolean, selected: boolean): string {
  if (selected) {
    const inh = value === undefined ? chalk.cyan.bold('inherit') : chalk.dim('inherit');
    const f   = value === false     ? chalk.red.bold('false')   : chalk.dim('false');
    const t   = value === true      ? chalk.green.bold('true')  : chalk.dim('true');
    return `${chalk.dim('←')} ${inh}  ${f}  ${t} ${chalk.dim('→')}`;
  }
  if (value === undefined) {
    return chalk.dim(`inherit (${effectiveValue ? 'true' : 'false'})`);
  }
  return value ? chalk.green('true') : chalk.red('false');
}

function buildTabLine(tabs: Tab[], activeTab: Tab, tabSelected: boolean, currentModel: string): string {
  const labels: Record<Tab, string> = {
    global: 'Global',
    provider: `Provider: ${getProviderId(currentModel)}`,
    model: `Model: ${currentModel}`,
  };

  const parts = tabs.map(tab => {
    const label = labels[tab];
    if (tab === activeTab) {
      return tabSelected
        ? chalk.bgCyan.black(` ${label} `)
        : chalk.cyan.bold(`[ ${label} ]`);
    }
    return chalk.dim(`  ${label}  `);
  });

  return '  ' + parts.join('  ');
}

function buildScreen(
  tab: Tab,
  tabs: Tab[],
  values: Record<string, TabValue>,
  effectiveValues: Record<string, boolean>,
  sel: number,
  globalPath: string,
  currentModel: string,
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('freecode config')}`);
  lines.push(`  ${chalk.dim(globalPath)}`);
  lines.push('');

  // Tab row (sel === -1 means tab row is focused)
  lines.push(buildTabLine(tabs, tab, sel === -1, currentModel));
  lines.push('');

  for (let i = 0; i < SETTINGS.length; i++) {
    const s = SETTINGS[i];
    const active = i === sel;
    const cursor = active ? chalk.cyan('▶') : ' ';
    const label  = active ? chalk.bold(s.label.padEnd(LABEL_W)) : chalk.reset(s.label.padEnd(LABEL_W));
    const effectiveVal = effectiveValues[s.key];

    let valueStr: string;
    if (tab === 'global') {
      valueStr = renderGlobalValue(values[s.key] as boolean, active);
    } else {
      valueStr = renderOverrideValue(values[s.key], effectiveVal, active);
    }

    const desc = chalk.dim(s.description);
    const valuePad = active ? valueStr : valueStr.padEnd(tab === 'global' ? 5 : 30);
    lines.push(`  ${cursor} ${label}  ${valuePad}   ${desc}`);
  }

  lines.push('');
  const hintSuffix = chalk.dim('↑ ↓  select     ← →  change     q  exit')
  lines.push(`  ${hintSuffix}`);
  lines.push('');
  return lines;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveGlobalSetting(globalPath: string, key: string, value: boolean): void {
  const existing = (readRawConfig(globalPath) as Record<string, unknown>) ?? {};
  delete existing['preferLocal'];
  existing[key] = value;
  writeConfigFile(globalPath, existing as Partial<Config>);
}

function saveOverrideSetting(globalPath: string, tab: Tab, currentModel: string, key: string, value: TabValue): void {
  const existing = (readRawConfig(globalPath) as Record<string, unknown>) ?? {};
  delete existing['preferLocal'];
  const providerId = getProviderId(currentModel);

  if (tab === 'provider' && providerId) {
    const overrides = (existing.providerOverrides as Record<string, Record<string, boolean>>) ?? {};
    if (!overrides[providerId]) overrides[providerId] = {};
    if (value === undefined) {
      delete overrides[providerId][key];
      if (Object.keys(overrides[providerId]).length === 0) delete overrides[providerId];
    } else {
      overrides[providerId][key] = value;
    }
    if (Object.keys(overrides).length === 0) delete existing.providerOverrides;
    else existing.providerOverrides = overrides;
  } else if (tab === 'model' && currentModel) {
    const overrides = (existing.modelOverrides as Record<string, Record<string, boolean>>) ?? {};
    if (!overrides[currentModel]) overrides[currentModel] = {};
    if (value === undefined) {
      delete overrides[currentModel][key];
      if (Object.keys(overrides[currentModel]).length === 0) delete overrides[currentModel];
    } else {
      overrides[currentModel][key] = value;
    }
    if (Object.keys(overrides).length === 0) delete existing.modelOverrides;
    else existing.modelOverrides = overrides;
  }

  writeConfigFile(globalPath, existing as Partial<Config>);
}

// ── Value cycling ─────────────────────────────────────────────────────────────

function cycleGlobal(current: boolean, direction: 1 | -1): boolean {
  return !current;
}

// Cycle order (right): inherit → false → true → inherit
// Cycle order (left):  inherit → true → false → inherit
const CYCLE_RIGHT: TabValue[] = [undefined, false, true];
const CYCLE_LEFT:  TabValue[] = [undefined, true, false];

function cycleOverride(current: TabValue, direction: 1 | -1): TabValue {
  const seq = direction === 1 ? CYCLE_RIGHT : CYCLE_LEFT;
  const idx = seq.indexOf(current);
  return seq[(idx + 1) % seq.length];
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runConfigCommand(rl: Interface, currentModel = ''): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('Config editor requires an interactive terminal.'));
    return;
  }

  const paths = getConfigPaths();
  const tabs = getAvailableTabs(currentModel);
  let activeTab: Tab = 'global';

  // sel: -1 = tab row, 0..N-1 = setting row
  let sel = 0;
  let rowCount = 0;

  function currentValues(): Record<string, TabValue> {
    if (activeTab === 'global') return loadGlobalValues() as Record<string, TabValue>;
    return loadOverrideValues(activeTab, currentModel, paths.globalPath);
  }

  function effectiveValues(): Record<string, boolean> {
    const resolved = resolveModelSettings(currentModel || ':');
    const vals: Record<string, boolean> = {};
    for (const s of SETTINGS) vals[s.key] = resolved[s.key as keyof typeof resolved];
    return vals;
  }

  let values = currentValues();
  let effective = effectiveValues();

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
    const lines = buildScreen(activeTab, tabs, values, effective, sel, paths.globalPath, currentModel);
    if (rowCount > 0) process.stdout.write(`\x1b[${rowCount}A\r\x1b[J`);
    process.stdout.write(lines.join('\n') + '\n');
    rowCount = renderedRows(lines);
  }

  return new Promise<void>((resolve) => {
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdout.write('\x1b[?25l');

    redraw();

    const onData = (data: string): void => {
      if (data === '\x03') {
        cleanup();
        process.exit(0);
      }

      if (data === 'q' || data === 'Q' || data === '\x1b') {
        cleanup();
        resolve();
        return;
      }

      // Up arrow
      if (data === '\x1b[A') {
        if (sel > 0) {
          sel--;
        } else if (sel === 0) {
          sel = -1; // move to tab row
        }
        redraw();
        return;
      }

      // Down arrow
      if (data === '\x1b[B') {
        if (sel === -1) {
          sel = 0;
        } else if (sel < SETTINGS.length - 1) {
          sel++;
        }
        redraw();
        return;
      }

      // Left / right arrows
      if (data === '\x1b[C' || data === '\x1b[D' || data === ' ' || data === '\r') {
        const direction: 1 | -1 = (data === '\x1b[D') ? -1 : 1;

        if (sel === -1) {
          // Tab row: left/right switch tab
          const idx = tabs.indexOf(activeTab);
          const newIdx = Math.max(0, Math.min(tabs.length - 1, idx + direction));
          if (newIdx !== idx) {
            activeTab = tabs[newIdx];
            values = currentValues();
            effective = effectiveValues();
          }
          redraw();
          return;
        }

        const setting = SETTINGS[sel];
        if (activeTab === 'global') {
          const newVal = cycleGlobal(values[setting.key] as boolean, direction);
          values[setting.key] = newVal;
          saveGlobalSetting(paths.globalPath, setting.key, newVal);
          effective = effectiveValues();
        } else {
          const newVal = cycleOverride(values[setting.key], direction);
          values[setting.key] = newVal;
          saveOverrideSetting(paths.globalPath, activeTab, currentModel, setting.key, newVal);
          effective = effectiveValues();
        }
        redraw();
        return;
      }
    };

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (rowCount > 0) {
        const r = process.stdout.rows || 24;
        // Reset scroll region to full screen so \x1b[J covers all rows (including
        // any content that leaked below the active scroll region on Windows ConPTY).
        process.stdout.write('\x1b[r');
        process.stdout.write(`\x1b[${rowCount}A\r\x1b[J`);
        // Restore the scroll region that teardownBottomUI set before us.
        process.stdout.write(`\x1b[1;${r - 2}r`);
      }
      process.stdout.write('\x1b[?25h');
      rl.resume();
    }

    process.stdin.on('data', onData);
  });
}
