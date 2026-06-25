import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, loadConfig, readRawConfig, resolveModelSettings, updateGlobalConfig, writeConfigFile } from '../config/index.js';
import type { Config, OverridableSettings } from '../providers/types.js';
import { getModelSettings, setModelSetting } from '../providers/model-store.js';
import { countWrappedLines } from '../cli/raw-picker.js';
import { ensureStoreReady } from '../providers/db.js';
import { runMenuShell } from '../cli/menu-shell.js';
import { runListMenu, type MenuTab } from '../cli/list-menu.js';
import { redrawBanner } from '../cli/banner.js';

// ── Setting definitions ───────────────────────────────────────────────────────

type OverridableKey = keyof OverridableSettings;

interface BoolSetting {
  type: 'boolean';
  key: OverridableKey | keyof Config;
  label: string;
  description: string;
  globalOnly?: true;
  modelOnly?: true;
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
  { type: 'number',  key: 'diffContextLines',   label: 'Diff context',    description: 'Lines of surrounding context shown above/below each edit diff (stops at blank line)', min: 0, max: 10, step: 1, unit: '', globalOnly: true },
  { type: 'boolean', key: 'showEvalDots',      label: 'Eval dots',        description: 'Show per-scenario eval result circles in the model picker', globalOnly: true },
  { type: 'boolean', key: 'loadAgentsMd',     label: 'Load AGENTS.md',   description: 'Inject AGENTS.md from the working directory into the system prompt', modelOnly: true },
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
  for (const s of SETTINGS) vals[s.key] = cfg[s.key] as boolean | number;
  return vals;
}

function loadOverrideValues(tab: Tab, currentModel: string): Record<string, TabValue> {
  const vals: Record<string, TabValue> = {};

  if (tab === 'model' && currentModel) {
    const modelSettings = getModelSettings(currentModel);
    for (const s of SETTINGS) {
      const v = modelSettings[s.key as keyof OverridableSettings];
      vals[s.key] = typeof v === 'boolean' ? v : undefined;
    }
    return vals;
  }

  const providerId = getProviderId(currentModel);
  let overrides: Record<string, unknown> = {};
  if (tab === 'provider' && providerId) {
    const cfg = loadConfig();
    overrides = ((cfg.providerOverrides as Record<string, unknown>)?.[providerId] as Record<string, unknown>) ?? {};
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
    const s = setting;
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

// Settings visible on a given tab. Global hides model-only settings; the
// provider/model tabs hide global-only settings. Each tab's list is contiguous
// so the shared list-menu's count()/selected index line up 1:1.
function visibleSettings(tab: Tab): Setting[] {
  return SETTINGS.filter(s => {
    if (tab !== 'global' && 'globalOnly' in s && s.globalOnly) return false;
    if (tab === 'global' && 'modelOnly' in s && s.modelOnly) return false;
    return true;
  });
}

// Resolved (post-inheritance) values, used to show "inherit (true)" on the
// provider/model tabs. Recomputed live each render so cross-tab edits show.
function effectiveValues(currentModel: string): Record<string, boolean> {
  const resolved = resolveModelSettings(currentModel || ':');
  const vals: Record<string, boolean> = {};
  for (const s of SETTINGS) {
    if ('globalOnly' in s && s.globalOnly) continue;
    vals[s.key] = resolved[s.key as keyof typeof resolved];
  }
  return vals;
}

function buildSettingRows(tab: Tab, selected: number, currentModel: string): string[] {
  const visible = visibleSettings(tab);
  const values = tab === 'global' ? loadGlobalValues() : loadOverrideValues(tab, currentModel);
  const effective = effectiveValues(currentModel);

  const lines: string[] = [];
  for (let i = 0; i < visible.length; i++) {
    const s = visible[i];
    const active = i === selected;
    const cursor = active ? chalk.cyan('▶') : ' ';
    const label  = active ? chalk.bold(s.label.padEnd(LABEL_W)) : chalk.reset(s.label.padEnd(LABEL_W));
    const effectiveVal = effective[s.key as string];

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
  lines.push(`  ${chalk.dim('↑ ↓  select     ← →  change     q  exit')}`);
  lines.push('');
  return lines;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveGlobalSetting(_globalPath: string, key: string, value: boolean | number): void {
  updateGlobalConfig({ [key]: value });
}

function saveOverrideSetting(globalPath: string, tab: Tab, currentModel: string, key: string, value: TabValue): void {
  if (tab === 'model' && currentModel) {
    setModelSetting(currentModel, key as keyof OverridableSettings, value);
    return;
  }

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
    writeConfigFile(globalPath, existing);
  }
}

// ── Value cycling ─────────────────────────────────────────────────────────────

function cycleGlobal(current: boolean, _direction: 1 | -1): boolean {
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

// ── Tabs (list-menu) ────────────────────────────────────────────────────────

// One config tab for the shared list-menu. Per-row interaction is value-cycling
// (not item selection), so there is no actionMenu/renderDetail; Left/Right/Space/
// Enter cycle the focused setting via onKey, and 'q' closes.
function buildConfigTab(tab: Tab, currentModel: string, globalPath: string): MenuTab<void> {
  const labels: Record<Tab, string> = {
    global: 'Global',
    provider: `Provider: ${getProviderId(currentModel)}`,
    model: `Model: ${currentModel}`,
  };
  return {
    id: tab,
    label: labels[tab],
    count: () => visibleSettings(tab).length,
    renderBody: (selected) => ({
      lines: buildSettingRows(tab, selected, currentModel),
      selectedLineIdx: selected,
    }),
    onKey: (key, ctx) => {
      if (key === 'q' || key === 'Q') { ctx.close(undefined); return true; }
      if (key === '\x1b[C' || key === '\x1b[D' || key === ' ' || key === '\r') {
        const direction: 1 | -1 = key === '\x1b[D' ? -1 : 1;
        const setting = visibleSettings(tab)[ctx.getSelected()];
        if (!setting) return true;
        if (tab === 'global') {
          const values = loadGlobalValues();
          const newVal = setting.type === 'number'
            ? cycleNumeric(values[setting.key] as number, setting, direction)
            : cycleGlobal(values[setting.key] as boolean, direction);
          saveGlobalSetting(globalPath, setting.key, newVal);
        } else {
          const values = loadOverrideValues(tab, currentModel);
          const newVal = cycleOverride(values[setting.key], direction);
          saveOverrideSetting(globalPath, tab, currentModel, setting.key, newVal);
        }
        ctx.redraw();
        return true;
      }
      return false;
    },
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runConfigCommand(
  rl: Interface,
  currentModel = '',
  onRestore?: () => void,
): Promise<void> {
  return runMenuShell<void>(rl, {
    ensureReady: ensureStoreReady,
    onRestore,
    run: () => runConfigBody(rl, currentModel),
  });
}

async function runConfigBody(rl: Interface, currentModel: string): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('Config editor requires an interactive terminal.'));
    return;
  }

  const paths = getConfigPaths();
  const tabIds = getAvailableTabs(currentModel);
  const tabs = tabIds.map(t => buildConfigTab(t, currentModel, paths.globalPath));

  await runListMenu<void>(rl, {
    tabs,
    wrap: false,
    countLines: countWrappedLines,
    renderTabBar: (menuTabs, activeIndex, focused) => {
      const ids = menuTabs.map(t => t.id as Tab);
      return ['', buildTabLine(ids, ids[activeIndex], focused, currentModel), ''];
    },
    onExitClear(rowCount) {
      const r = process.stdout.rows || 24;
      // Reset scroll region to full screen so \x1b[J covers all rows (including
      // any content that leaked below the active scroll region on Windows ConPTY).
      process.stdout.write('\x1b[r');
      process.stdout.write(`\x1b[${rowCount}A\r\x1b[J`);
      // Restore the scroll region that teardownBottomUI set before us.
      process.stdout.write(`\x1b[1;${r - 2}r`);
    },
  });

  redrawBanner();
}
