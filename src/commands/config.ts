import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, loadConfig, readRawConfig, resolveModelSettings, writeConfigFile } from '../config/index.js';
import type { Config, OverridableSettings } from '../providers/types.js';
import { countWrappedLines, runRawPicker } from '../cli/raw-picker.js';

// ── Setting definitions ───────────────────────────────────────────────────────

type OverridableKey = keyof OverridableSettings;

interface BoolSetting {
  type: 'boolean';
  key: OverridableKey;
  label: string;
  description: string;
}

interface NumericSetting {
  type: 'number';
  key: keyof Config;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  globalOnly: true;
}

type Setting = BoolSetting | NumericSetting;

const SETTINGS: Setting[] = [
  { type: 'boolean', key: 'toolRationale',    label: 'Tool rationale',   description: 'Ask model to explain each tool call before executing' },
  { type: 'boolean', key: 'showProviderUsage', label: 'Provider usage',   description: 'Print token/rate-limit usage from the provider after each turn' },
  { type: 'boolean', key: 'parallelTools',     label: 'Parallel tools',   description: 'Allow model to call multiple tools in the same response' },
  { type: 'number',  key: 'retryMaxWaitSeconds', label: 'Max retry wait', description: 'Max seconds to wait before retrying a rate-limited request', min: 5, max: 300, step: 5, unit: 's', globalOnly: true },
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

function loadGlobalValues(): Record<string, boolean | number> {
  const cfg = loadConfig();
  const vals: Record<string, boolean | number> = {};
  for (const s of SETTINGS) vals[s.key] = cfg[s.key as keyof Config] as boolean | number;
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

function renderGlobalValue(value: boolean | number, selected: boolean, setting: Setting): string {
  if (setting.type === 'number') {
    const s = setting as NumericSetting;
    const display = `${value}${s.unit}`;
    if (selected) return `${chalk.dim('←')} ${chalk.cyan.bold(display)} ${chalk.dim('→')}`;
    return chalk.cyan(display);
  }
  const v = value as boolean;
  if (selected) {
    const t = v  ? chalk.green.bold('true')  : chalk.dim('true');
    const f = !v ? chalk.red.bold('false') : chalk.dim('false');
    return `${chalk.dim('←')} ${f}  ${t} ${chalk.dim('→')}`;
  }
  return v ? chalk.green('true') : chalk.red('false');
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
  values: Record<string, TabValue | number>,
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
    if (tab !== 'global' && 'globalOnly' in s && s.globalOnly) continue;
    const active = i === sel;
    const cursor = active ? chalk.cyan('▶') : ' ';
    const label  = active ? chalk.bold(s.label.padEnd(LABEL_W)) : chalk.reset(s.label.padEnd(LABEL_W));
    const effectiveVal = effectiveValues[s.key as string];

    let valueStr: string;
    if (tab === 'global') {
      valueStr = renderGlobalValue(values[s.key] as boolean | number, active, s);
    } else {
      valueStr = renderOverrideValue(values[s.key] as TabValue, effectiveVal, active);
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

function saveGlobalSetting(globalPath: string, key: string, value: boolean | number): void {
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

function cycleNumeric(current: number, s: NumericSetting, direction: 1 | -1): number {
  return Math.max(s.min, Math.min(s.max, current + direction * s.step));
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
  let sel = 0;

  function currentValues(): Record<string, TabValue | number> {
    if (activeTab === 'global') return loadGlobalValues() as Record<string, TabValue | number>;
    return loadOverrideValues(activeTab, currentModel, paths.globalPath);
  }

  function effectiveValues(): Record<string, boolean> {
    const resolved = resolveModelSettings(currentModel || ':');
    const vals: Record<string, boolean> = {};
    for (const s of SETTINGS) {
      if ('globalOnly' in s && s.globalOnly) continue;
      vals[s.key] = resolved[s.key as keyof typeof resolved];
    }
    return vals;
  }

  let values: Record<string, TabValue | number> = currentValues();
  let effective = effectiveValues();

  await runRawPicker<void>(rl, {
    render: () => buildScreen(activeTab, tabs, values, effective, sel, paths.globalPath, currentModel),
    countLines: countWrappedLines,
    onExitClear(rowCount) {
      const r = process.stdout.rows || 24;
      // Reset scroll region to full screen so \x1b[J covers all rows (including
      // any content that leaked below the active scroll region on Windows ConPTY).
      process.stdout.write('\x1b[r');
      process.stdout.write(`\x1b[${rowCount}A\r\x1b[J`);
      // Restore the scroll region that teardownBottomUI set before us.
      process.stdout.write(`\x1b[1;${r - 2}r`);
    },
    onKey(key, redraw, close) {
      if (key === 'q' || key === 'Q' || key === '\x1b') { close(); return; }

      if (key === '\x1b[A') {
        if (sel > 0) sel--;
        else if (sel === 0) sel = -1;
        redraw();
        return;
      }

      if (key === '\x1b[B') {
        if (sel === -1) sel = 0;
        else if (sel < SETTINGS.length - 1) sel++;
        redraw();
        return;
      }

      if (key === '\x1b[C' || key === '\x1b[D' || key === ' ' || key === '\r') {
        const direction: 1 | -1 = (key === '\x1b[D') ? -1 : 1;

        if (sel === -1) {
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
          let newVal: boolean | number;
          if (setting.type === 'number') {
            newVal = cycleNumeric(values[setting.key] as unknown as number, setting as NumericSetting, direction);
          } else {
            newVal = cycleGlobal(values[setting.key] as boolean, direction);
          }
          (values as Record<string, boolean | number>)[setting.key] = newVal;
          saveGlobalSetting(paths.globalPath, setting.key, newVal);
          effective = effectiveValues();
        } else {
          const newVal = cycleOverride(values[setting.key] as TabValue, direction);
          values[setting.key] = newVal;
          saveOverrideSetting(paths.globalPath, activeTab, currentModel, setting.key, newVal);
          effective = effectiveValues();
        }
        redraw();
      }
    },
  });
}
