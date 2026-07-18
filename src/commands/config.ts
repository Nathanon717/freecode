import chalk from 'chalk';
import type { Interface } from 'readline';
import { getBannerColor } from '../cli/banner.js';
import { getConfigPaths, loadConfig, readRawConfig, resolveModelSettings, updateGlobalConfig, writeConfigFile } from '../config/index.js';
import type { Config, OverridableSettings } from '../providers/types.js';
import { getModelSettings, setModelSetting, isNativeToolsDisabled } from '../providers/model-data.js';
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
  modelTabOnly?: true;
}

interface NumericSetting {
  type: 'number';
  key: OverridableKey | keyof Config;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** Rendered dim as "off" at this value, instead of as a number. */
  offAt?: number;
  globalOnly?: true;
  modelOnly?: true;
  modelTabOnly?: true;
}

type Setting = BoolSetting | NumericSetting;

const SETTINGS: Setting[] = [
  { type: 'boolean', key: 'toolRationale',    label: 'Tool rationale',   description: 'Ask model to explain each tool call before executing' },
  { type: 'boolean', key: 'showProviderUsage', label: 'Provider usage',   description: 'Print token/rate-limit usage from the provider after each turn' },
  { type: 'boolean', key: 'parallelTools',     label: 'Parallel tools',   description: 'Allow model to call multiple tools in the same response' },
  { type: 'number',  key: 'retryMaxWaitSeconds', label: 'Max retry wait', description: 'Max seconds to wait before retrying a rate-limited request', min: 5, max: 300, step: 5, unit: 's', globalOnly: true },
  { type: 'number',  key: 'diffContextLines',   label: 'Diff context',    description: 'Lines of surrounding context shown above/below each edit diff (stops at blank line)', min: 0, max: 10, step: 1, unit: '', globalOnly: true },
  { type: 'boolean', key: 'showEvalDots',      label: 'Eval dots',        description: 'Show per-scenario eval result circles in the model picker', globalOnly: true },
  { type: 'number',  key: 'autoApproveTokenBudget', label: 'Auto-approve under', description: 'Auto-approve read/grep/list_dir calls adding fewer than this many tokens (0 = off)', min: 0, max: 1000, step: 100, unit: ' tokens', offAt: 0 },
  { type: 'boolean', key: 'loadAgentsMd',     label: 'Load AGENTS.md',   description: 'Inject AGENTS.md from the working directory into the system prompt', modelOnly: true },
  { type: 'boolean', key: 'parsedTools',      label: 'Parsed tools',     description: 'Use text-based tool protocol instead of native function calling', modelTabOnly: true },
];

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'global' | 'provider' | 'model';

function getProviderId(model: string): string {
  const idx = model.indexOf(':');
  return idx !== -1 ? model.slice(0, idx) : '';
}

function getModelId(model: string): string {
  const idx = model.indexOf(':');
  return idx !== -1 ? model.slice(idx + 1) : model;
}

function isParsedToolsForced(currentModel: string): boolean {
  return isNativeToolsDisabled(getProviderId(currentModel), getModelId(currentModel));
}

function getAvailableTabs(currentModel: string): Tab[] {
  if (!currentModel || !currentModel.includes(':')) return ['global'];
  return ['global', 'provider', 'model'];
}

// ── Value loading ─────────────────────────────────────────────────────────────

// Global tab: boolean | number. Provider/Model tabs: the same, plus undefined
// (undefined = inherit from parent).
type TabValue = boolean | number | undefined;

function loadGlobalValues(): Record<string, boolean | number> {
  const cfg = loadConfig();
  const vals: Record<string, boolean | number> = {};
  for (const s of visibleSettings('global')) vals[s.key] = cfg[s.key as keyof Config] as boolean | number;
  return vals;
}

function loadOverrideValues(tab: Tab, currentModel: string): Record<string, TabValue> {
  const vals: Record<string, TabValue> = {};

  // A setting's stored value only counts as an override when its type matches the
  // setting's declared type; anything else (including a stale value left by an
  // earlier shape) reads as inherit.
  const asOverride = (s: Setting, v: unknown): TabValue =>
    typeof v === (s.type === 'number' ? 'number' : 'boolean') ? (v as TabValue) : undefined;

  if (tab === 'model' && currentModel) {
    const modelSettings = getModelSettings(currentModel);
    for (const s of SETTINGS) {
      vals[s.key] = asOverride(s, modelSettings[s.key as keyof OverridableSettings]);
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
    vals[s.key] = asOverride(s, overrides[s.key]);
  }
  return vals;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const LABEL_W = 20;

// A numeric value's text plus the colour that carries its state: at `offAt` the
// setting does nothing, so it reads dim "off" rather than a live-looking number.
function formatNumeric(value: number, s: NumericSetting, bold: boolean): string {
  if (value === s.offAt) return bold ? chalk.dim.bold('off') : chalk.dim('off');
  const display = `${value}${s.unit}`;
  return bold ? getBannerColor().bold(display) : getBannerColor()(display);
}

function renderGlobalValue(value: boolean | number, selected: boolean, setting: Setting): string {
  if (setting.type === 'number') {
    const display = formatNumeric(value as number, setting, selected);
    if (selected) return `${chalk.dim('←')} ${display} ${chalk.dim('→')}`;
    return display;
  }
  const v = value as boolean;
  if (selected) {
    const t = v  ? chalk.green.bold('true')  : chalk.dim('true');
    const f = !v ? chalk.red.bold('false') : chalk.dim('false');
    return `${chalk.dim('←')} ${f}  ${t} ${chalk.dim('→')}`;
  }
  return v ? chalk.green('true') : chalk.red('false');
}

function renderForcedValue(selected: boolean): string {
  if (selected) return chalk.green.bold('true') + ' ' + chalk.dim('(auto-detected, locked)');
  return chalk.green('true') + chalk.dim(' (auto-detected)');
}

// Numeric override: a single value that is either "inherit" or a concrete number,
// stepped with ← →. Unlike the boolean cycle there is no room to show every
// choice at once, so only the current one is rendered.
function renderNumericOverride(
  value: TabValue,
  effectiveValue: number,
  selected: boolean,
  s: NumericSetting,
): string {
  const inherited = value === undefined;
  const body = inherited
    ? chalk.dim(`inherit (${effectiveValue === s.offAt ? 'off' : `${effectiveValue}${s.unit}`})`)
    : formatNumeric(value as number, s, selected);
  return selected ? `${chalk.dim('←')} ${body} ${chalk.dim('→')}` : body;
}

function renderOverrideValue(value: TabValue, effectiveValue: boolean, selected: boolean): string {
  if (selected) {
    const inh = value === undefined ? getBannerColor().bold('inherit') : chalk.dim('inherit');
    const f   = value === false     ? chalk.red.bold('false')   : chalk.dim('false');
    const t   = value === true      ? chalk.green.bold('true')  : chalk.dim('true');
    return `${chalk.dim('←')} ${inh}  ${f}  ${t} ${chalk.dim('→')}`;
  }
  if (value === undefined) {
    return chalk.dim(`inherit (${effectiveValue ? 'true' : 'false'})`);
  }
  return value ? chalk.green('true') : chalk.red('false');
}

// Settings visible on a given tab. Global hides model-only and modelTabOnly
// settings; the provider/model tabs hide global-only settings; provider tab
// also hides modelTabOnly settings. Each tab's list is contiguous so the
// shared list-menu's count()/selected index line up 1:1.
function visibleSettings(tab: Tab): Setting[] {
  return SETTINGS.filter(s => {
    if (tab !== 'global' && 'globalOnly' in s && s.globalOnly) return false;
    if (tab === 'global' && 'modelOnly' in s && s.modelOnly) return false;
    if (tab === 'global' && 'modelTabOnly' in s && s.modelTabOnly) return false;
    if (tab === 'provider' && 'modelTabOnly' in s && s.modelTabOnly) return false;
    return true;
  });
}

// Resolved (post-inheritance) values, used to show "inherit (true)" on the
// provider/model tabs. Recomputed live each render so cross-tab edits show.
function effectiveValues(currentModel: string): Record<string, boolean | number> {
  const resolved = resolveModelSettings(currentModel || ':');
  const vals: Record<string, boolean | number> = {};
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
    const cursor = active ? getBannerColor()('▶') : ' ';
    const label  = active ? chalk.bold(s.label.padEnd(LABEL_W)) : chalk.reset(s.label.padEnd(LABEL_W));
    const effectiveVal = effective[s.key as string];

    let valueStr: string;
    if (tab === 'global') {
      valueStr = renderGlobalValue(values[s.key] as boolean | number, active, s);
    } else if (tab === 'model' && s.key === 'parsedTools' && isParsedToolsForced(currentModel)) {
      valueStr = renderForcedValue(active);
    } else if (s.type === 'number') {
      valueStr = renderNumericOverride(values[s.key], effectiveVal as number, active, s);
    } else {
      valueStr = renderOverrideValue(values[s.key], effectiveVal as boolean, active);
    }

    const desc = chalk.dim(s.description);
    const valuePad = active ? valueStr : valueStr.padEnd(tab === 'global' ? 5 : 30);
    lines.push(`  ${cursor} ${label}  ${valuePad}   ${desc}`);
  }

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
    // Seed from the merged config, not config.json — overrides synced from other
    // devices live in the DB and may be absent from this device's file.
    const merged = (loadConfig().providerOverrides ?? {}) as Record<string, Record<string, boolean | number>>;
    const overrides: Record<string, Record<string, boolean | number>> = {};
    for (const [id, settings] of Object.entries(merged)) overrides[id] = { ...settings };
    if (!overrides[providerId]) overrides[providerId] = {};
    if (value === undefined) {
      delete overrides[providerId][key];
      if (Object.keys(overrides[providerId]).length === 0) delete overrides[providerId];
    } else {
      overrides[providerId][key] = value;
    }
    // Always explicit — an empty map is how a cleared override reaches the DB.
    existing.providerOverrides = overrides;
    writeConfigFile(globalPath, existing, true);
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

// Numeric override ladder: inherit sits one rung below `min`, so ← from `min`
// clears the override and → from inherit adopts `min`. Both ends clamp rather
// than wrap — wrapping past the max back to inherit would make a held arrow key
// silently undo the value the user was stepping toward.
function cycleNumericOverride(current: TabValue, s: NumericSetting, direction: 1 | -1): TabValue {
  if (current === undefined) return direction === 1 ? s.min : undefined;
  const next = (current as number) + direction * s.step;
  if (next < s.min) return undefined;
  return Math.min(s.max, next);
}

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
    controls: '↑ ↓  select     ← →  change     q  exit',
    onKey: (key, ctx) => {
      if (key === 'q' || key === 'Q') { ctx.close(undefined); return true; }
      if (key === '\x1b[C' || key === '\x1b[D' || key === ' ' || key === '\r') {
        const direction: 1 | -1 = key === '\x1b[D' ? -1 : 1;
        const setting = visibleSettings(tab)[ctx.getSelected()];
        if (!setting) return true;
        if (tab === 'model' && setting.key === 'parsedTools' && isParsedToolsForced(currentModel)) return true;
        if (tab === 'global') {
          const values = loadGlobalValues();
          const newVal = setting.type === 'number'
            ? cycleNumeric(values[setting.key] as number, setting, direction)
            : cycleGlobal(values[setting.key] as boolean, direction);
          saveGlobalSetting(globalPath, setting.key, newVal);
        } else {
          const values = loadOverrideValues(tab, currentModel);
          const newVal = setting.type === 'number'
            ? cycleNumericOverride(values[setting.key], setting, direction)
            : cycleOverride(values[setting.key], direction);
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
  });

  redrawBanner();
}
