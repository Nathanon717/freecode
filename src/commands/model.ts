import chalk from 'chalk';
import type { Interface } from 'readline';
import { loadConfig, resolveApiKey, saveDefaultModel } from '../config/index.js';
import { getFavorites, setFavorite, getNoNativeToolsKeys, getModel } from '../providers/model-store.js';
import { ensureStoreReady } from '../providers/db.js';
import { PROVIDER_REGISTRY, initDynamicProviders } from '../providers/registry.js';
import { markModelSelected } from '../providers/model-cache.js';
import { clearModelNewFlag } from '../providers/registry.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import type { PricingConfidence } from '../providers/pricing-verifier.js';
import { countWrappedLines, runRawPicker } from '../cli/raw-picker.js';
import { loadEvalDotsData, buildEvalDots, type EvalDotsData } from '../cli/eval-dots.js';
import { InlineActionMenu } from '../cli/action-menu.js';

export interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  modelsSource?: 'static' | 'live';
  isNew?: boolean;
  noNativeTools?: boolean;
  isFavorite?: boolean;
  _favSection?: boolean; // true = this displayItems entry is the Favorites-section row
  pricing?: { input: number | null; output: number | null; confidence: PricingConfidence };
  evalDots?: string;
  rateLimits?: { buckets: Record<string, { limit: number; intervalMs: number | null }>; observedAt: string };
}

function modelPreference(item: ModelMenuItem): string {
  return `${item.providerId}:${item.modelId}`;
}

function formatPricingLabel(input: number, output: number): string {
  const fmt = (n: number): string => `$${parseFloat(n.toFixed(2))}`;
  return `${fmt(input)}/${fmt(output)}/MTok`;
}

function buildPricingBadge(pricing?: ModelMenuItem['pricing']): string {
  if (!pricing) return '';
  if (pricing.confidence === 'disagree') return chalk.red(' sources disagree');
  if (pricing.input !== null && pricing.output !== null) {
    return pricing.confidence === 'agreed'
      ? chalk.green(` ${formatPricingLabel(pricing.input, pricing.output)}`)
      : chalk.yellow(` ${formatPricingLabel(pricing.input, pricing.output)}`);
  }
  return '';
}

function sortItemsByFavorites(items: ModelMenuItem[]): void {
  const providers = [...new Set(items.map(x => x.providerId))];
  let idx = 0;
  for (const pid of providers) {
    const group = items.filter(x => x.providerId === pid);
    const sorted = [...group.filter(x => x.isFavorite), ...group.filter(x => !x.isFavorite)];
    for (const item of sorted) items[idx++] = item;
  }
}

type GroupMode = 'pretty' | 'provider';

// Builds the flat displayItems list. Favorites appear twice: once as _favSection=true entries
// at the front (Favorites section), and once as regular entries in their provider section.
// This makes every visual row independently selectable via Up/Down.
function buildDisplayList(items: ModelMenuItem[]): ModelMenuItem[] {
  return [...items.filter(x => x.isFavorite).map(x => ({ ...x, _favSection: true })), ...items];
}

export function filterModelItems(items: ModelMenuItem[], query: string): ModelMenuItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;

  return items.filter(item => [
    item.providerId,
    item.providerName,
    item.modelId,
    item.displayName,
    modelPreference(item),
  ].some(value => value.toLowerCase().includes(normalized)));
}

export async function getSelectableModels(): Promise<ModelMenuItem[]> {
  await ensureStoreReady();
  await initDynamicProviders();
  const items: ModelMenuItem[] = [];

  for (const provider of PROVIDER_REGISTRY) {
    if (!resolveApiKey(provider)) continue;
    for (const model of provider.models) {
      items.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        displayName: model.displayName,
        modelsSource: provider.modelsSource,
        isNew: model.isNew,
      });
    }
  }

  const noNativeTools = getNoNativeToolsKeys();
  for (const item of items) {
    if (noNativeTools.has(`${item.providerId}:${item.modelId}`)) item.noNativeTools = true;
    const stored = getModel(`${item.providerId}:${item.modelId}`);
    if (stored?.rateLimits) item.rateLimits = stored.rateLimits;
  }

  const pricedItems = items.filter(i => i.providerId === 'anthropic' || i.providerId === 'openai');
  const pricingResults = await Promise.all(pricedItems.map(item =>
    item.providerId === 'anthropic'
      ? getAnthropicVerifiedRates(item.modelId)
      : getOpenAIVerifiedRates(item.modelId)
  ));

  for (let i = 0; i < pricedItems.length; i++) {
    const rates = pricingResults[i];
    if (rates.confidence === 'disagree') {
      pricedItems[i].pricing = { input: null, output: null, confidence: rates.confidence };
    } else if (rates.inputPerMillion !== null && rates.outputPerMillion !== null) {
      pricedItems[i].pricing = { input: rates.inputPerMillion, output: rates.outputPerMillion, confidence: rates.confidence };
    }
  }

  return items;
}

export function buildAllItemLines(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  groupMode: GroupMode = 'pretty',
): { itemLines: string[]; selectedLineIdx: number } {
  const showId = groupMode === 'provider';
  const itemLines: string[] = [];
  let lastProvider = '';
  let selectedLineIdx = 0;

  // Favorites section: items with _favSection=true, which come first in the array.
  // Each renders with full provider:model ID as the label.
  if (items.some(x => x._favSection)) {
    itemLines.push(`  ${chalk.bold.yellow('Favorites')}`);
    for (let i = 0; i < items.length; i++) {
      if (!items[i]._favSection) continue;
      const item = items[i];
      const active = i === selected;
      if (active) selectedLineIdx = itemLines.length;
      const pref = modelPreference(item);
      const current = pref === currentModel;
      const cursor = active ? chalk.cyan('>') : ' ';
      const renderedName = active ? chalk.inverse(pref) : chalk.yellow(pref);
      const marker = current ? chalk.green(' current') : '';
      const pricingBadge = buildPricingBadge(item.pricing);
      const dotsBadge = item.evalDots ? ` ${item.evalDots}` : '';
      itemLines.push(`  ${cursor} ${renderedName} ★${pricingBadge}${dotsBadge}${marker}`);
    }
    itemLines.push('');
  }

  // Provider section: all models (including favorites shown again here).
  for (let i = 0; i < items.length; i++) {
    if (items[i]._favSection) continue;
    const item = items[i];

    if (item.providerId !== lastProvider) {
      if (lastProvider) itemLines.push('');
      const staticBadge = item.modelsSource !== 'live' ? chalk.dim('  · static') : '';
      itemLines.push(`  ${chalk.bold(item.providerName)}${staticBadge}`);
      lastProvider = item.providerId;
    }

    const active = i === selected;
    if (active) selectedLineIdx = itemLines.length;
    const pref = modelPreference(item);
    const current = pref === currentModel;
    const cursor = active ? chalk.cyan('>') : ' ';
    const id = pref;
    const renderedName = active
      ? chalk.inverse(item.displayName)
      : item.isFavorite
        ? chalk.yellow(item.displayName)
        : chalk.cyan(item.displayName);
    const marker = current ? chalk.green(' current') : '';
    const favBadge = item.isFavorite ? chalk.yellow(' ★') : '';
    const newBadge = item.isNew ? chalk.yellow(' new') : '';
    const ptBadge = item.noNativeTools ? chalk.dim(' ~tools') : '';
    const pricingBadge = buildPricingBadge(item.pricing);
    const dotsBadge = item.evalDots ? ` ${item.evalDots}` : '';
    itemLines.push(`  ${cursor} ${renderedName}${favBadge}${newBadge}${ptBadge}${pricingBadge}${showId ? ` ${chalk.dim(id)}` : ''}${dotsBadge}${marker}`);
  }

  return { itemLines, selectedLineIdx };
}

function buildScreen(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  viewStart: number,
  groupMode: GroupMode,
  filterQuery: string,
): { lines: string[]; newViewStart: number; selectedScreenIdx: number } {
  const HEADER = 5;
  const CHROME = 3;
  const termHeight = (process.stdout.rows ?? 24) - 2;
  const maxItemLines = Math.max(4, termHeight - HEADER - CHROME);

  const { itemLines: rawItemLines, selectedLineIdx } = buildAllItemLines(items, selected, currentModel, groupMode);
  const itemLines = rawItemLines.length > 0
    ? rawItemLines
    : [`  ${chalk.dim('No models match the current filter')}`];

  let newViewStart = viewStart;
  if (selectedLineIdx < newViewStart) newViewStart = Math.max(0, selectedLineIdx - 2);
  if (selectedLineIdx >= newViewStart + maxItemLines) newViewStart = selectedLineIdx - maxItemLines + 1;
  newViewStart = Math.max(0, Math.min(newViewStart, Math.max(0, itemLines.length - maxItemLines)));

  const viewEnd = Math.min(newViewStart + maxItemLines, itemLines.length);
  const visibleLines = itemLines.slice(newViewStart, viewEnd);
  while (visibleLines.length < maxItemLines) visibleLines.push('');

  const tabHint = groupMode === 'pretty'
    ? chalk.dim('Tab show model IDs, ')
    : chalk.dim('Tab clean view, ');
  const filterLabel = filterQuery
    ? `${chalk.dim('Filter: ')}${chalk.cyan(filterQuery)}`
    : chalk.dim('Type to filter, Backspace clears characters');
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Select model')}`);
  lines.push(`  ${filterLabel}`);
  lines.push(`  ${tabHint}${chalk.dim('Up/Down navigate, ← toggle favorite, → view details, Enter action menu, Space select + default, Esc close')}`);
  lines.push('');

  // Header is 5 lines (indices 0-4), then scroll indicator at index 5, items at 6+
  lines.push(newViewStart > 0 ? chalk.dim('  · · ·') : '');
  for (const line of visibleLines) lines.push(line);
  lines.push(viewEnd < itemLines.length ? chalk.dim('  · · ·') : '');

  lines.push('');
  const selectedScreenIdx = 6 + (selectedLineIdx - newViewStart);
  return { lines, newViewStart, selectedScreenIdx };
}

function buildModelDetailScreen(item: ModelMenuItem): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Model details')}`);
  lines.push(`  ${chalk.dim('← or Esc back')}`);
  lines.push('');
  lines.push(`  ${chalk.bold('ID')}          ${chalk.cyan(`${item.providerId}:${item.modelId}`)}`);
  lines.push(`  ${chalk.bold('Provider')}    ${item.providerName}${item.modelsSource === 'live' ? chalk.dim(' (live)') : chalk.dim(' (static)')}`);
  lines.push(`  ${chalk.bold('Display')}     ${item.displayName}`);
  if (item.pricing) {
    const { input, output, confidence } = item.pricing;
    if (confidence === 'disagree') {
      lines.push(`  ${chalk.bold('Pricing')}     ${chalk.red('sources disagree')}`);
    } else if (input !== null && output !== null) {
      const color = confidence === 'agreed' ? chalk.green : chalk.yellow;
      lines.push(`  ${chalk.bold('Pricing')}     ${color(`$${input}/$${output}/MTok`)}`);
    }
  }
  if (item.noNativeTools) {
    lines.push(`  ${chalk.bold('Traits')}      ${chalk.dim('~tools (no native tool use)')}`);
  }
  if (item.evalDots) {
    lines.push(`  ${chalk.bold('Eval dots')}   ${item.evalDots}`);
  }
  if (item.rateLimits) {
    const { buckets, observedAt } = item.rateLimits;
    const s = (Date.now() - Date.parse(observedAt)) / 1000;
    const ago = s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
    const fmtName = (n: string) => n.replace(/-per-(minute|hour|day)$/, (_, u: string) => `/${u[0]}`).replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
    const fmtMs = (ms: number | null) => ms === 60_000 ? '/min' : ms === 3_600_000 ? '/hr' : ms === 86_400_000 ? '/day' : ms ? ` (${Math.round(ms / 1000)}s window)` : '';
    lines.push(`  ${chalk.bold('Rate limits')}  ${chalk.dim(`observed ${ago} ago`)}`);
    for (const [k, b] of Object.entries(buckets)) {
      lines.push(`    ${chalk.dim(fmtName(k).padEnd(14))} ${b.limit.toLocaleString()}${chalk.dim(fmtMs(b.intervalMs))}`);
    }
  }
  lines.push(`  ${chalk.bold('Favorite')}    ${item.isFavorite ? chalk.yellow('★ yes') : chalk.dim('no')}`);
  if (item.isNew) {
    lines.push(`  ${chalk.bold('Status')}      ${chalk.yellow('new')}`);
  }
  lines.push('');
  return lines;
}

type ModelPickResult = { item: ModelMenuItem; saveDefault: boolean } | null;

// Returns true if the interactive picker was shown (screen left blank on close),
// false for early exits that leave text output behind.
export async function runModelCommand(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void,
): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('Model picker requires an interactive terminal.'));
    return false;
  }

  console.log(chalk.dim('Loading available models...'));
  const items = await getSelectableModels();

  if (items.length === 0) {
    console.log(chalk.red('No configured providers or local models are available.'));
    return false;
  }

  if (loadConfig().showEvalDots) {
    const evalData: EvalDotsData = loadEvalDotsData();
    for (const item of items) {
      const model = `${item.providerId}:${item.modelId}`;
      item.evalDots = buildEvalDots(model, evalData);
    }
  }

  const favorites = getFavorites();
  for (const item of items) {
    item.isFavorite = favorites.has(modelPreference(item));
  }
  sortItemsByFavorites(items);

  let groupMode: GroupMode = 'pretty';
  let filterQuery = '';
  let unfilteredDisplayItems = buildDisplayList(items);
  let displayItems = filterModelItems(unfilteredDisplayItems, filterQuery);
  // Find current model; prefer the provider-section copy (not _favSection) for initial position.
  const currentPref = currentModel;
  let currentIndex = displayItems.findIndex(item => modelPreference(item) === currentPref && !item._favSection);
  if (currentIndex < 0) currentIndex = displayItems.findIndex(item => modelPreference(item) === currentPref);
  let selected = currentIndex >= 0 ? currentIndex : 0;
  let viewStart = 0;
  let actionMode = false;
  let detailMode = false;
  const actionMenu = new InlineActionMenu(['Select', 'View', 'Edit']);

  function refreshDisplayItems(preferred?: ModelMenuItem): void {
    unfilteredDisplayItems = buildDisplayList(items);
    displayItems = filterModelItems(unfilteredDisplayItems, filterQuery);
    viewStart = 0;

    if (displayItems.length === 0) {
      selected = 0;
      return;
    }

    if (preferred) {
      const pref = modelPreference(preferred);
      // Prefer provider-section copy so cursor stays in stable position after favorite toggle.
      let idx = displayItems.findIndex(item => modelPreference(item) === pref && !item._favSection);
      if (idx < 0) idx = displayItems.findIndex(item => modelPreference(item) === pref);
      selected = idx >= 0 ? idx : Math.min(selected, displayItems.length - 1);
    } else {
      selected = Math.min(selected, displayItems.length - 1);
    }
  }

  const result = await runRawPicker<ModelPickResult>(rl, {
    render(): string[] {
      if (detailMode && displayItems.length > 0) {
        return buildModelDetailScreen(displayItems[selected]);
      }
      const { lines, newViewStart, selectedScreenIdx } = buildScreen(displayItems, selected, currentModel, viewStart, groupMode, filterQuery);
      viewStart = newViewStart;
      if (actionMode) {
        lines.splice(selectedScreenIdx + 1, 0, ...actionMenu.renderLines());
        lines[3] = `  ${chalk.dim('↑/↓ action, Enter select, Esc back')}`;
      }
      return lines;
    },
    countLines: countWrappedLines,
    onKey(key, redraw, close) {
      if (detailMode) {
        if (key === '\x1b' || key === '\x1b[D') {
          detailMode = false;
          redraw();
        }
        return;
      }
      if (actionMode) {
        const res = actionMenu.handleKey(key);
        if (res.type === 'close') {
          actionMode = false;
          redraw();
        } else if (res.type === 'select') {
          if (res.option === 'Select') {
            close({ item: displayItems[selected], saveDefault: false });
          } else if (res.option === 'View') {
            actionMode = false;
            detailMode = true;
            redraw();
          } else {
            // Edit: stub — close sub-menu and redraw
            actionMode = false;
            redraw();
          }
        } else {
          redraw();
        }
        return;
      }
      if (key === '\x1b') { close(null); return; }
      if (key === '\x1b[A') {
        if (displayItems.length > 0) selected = (selected - 1 + displayItems.length) % displayItems.length;
        redraw();
        return;
      }
      if (key === '\x1b[B') {
        if (displayItems.length > 0) selected = (selected + 1) % displayItems.length;
        redraw();
        return;
      }
      if (key === '\x1b[C') {
        // → opens detail view (like eval picker)
        if (displayItems.length > 0) {
          detailMode = true;
          redraw();
        }
        return;
      }
      if (key === '\x1b[D') {
        // ← toggles favorite
        if (displayItems.length > 0) {
          const item = displayItems[selected];
          const pref = modelPreference(item);
          if (favorites.has(pref)) {
            favorites.delete(pref);
          } else {
            favorites.add(pref);
          }
          const isFav = favorites.has(pref);
          for (const baseItem of items) {
            if (modelPreference(baseItem) === pref) baseItem.isFavorite = isFav;
          }
          setFavorite(pref, isFav);
          sortItemsByFavorites(items);
          refreshDisplayItems(item);
          redraw();
        }
        return;
      }
      if (key === '\r' || key === '\n') {
        if (displayItems.length > 0) {
          actionMode = true;
          actionMenu.reset();
          redraw();
        }
        return;
      }
      if (key === ' ') {
        if (filterQuery) {
          filterQuery += ' ';
          refreshDisplayItems(displayItems[selected]);
          redraw();
        } else if (displayItems.length > 0) {
          close({ item: displayItems[selected], saveDefault: true });
        }
        return;
      }
      if (key === '\t') {
        const currentItem = displayItems[selected];
        const cycle: GroupMode[] = ['pretty', 'provider'];
        groupMode = cycle[(cycle.indexOf(groupMode) + 1) % cycle.length];
        refreshDisplayItems(currentItem);
        redraw();
        return;
      }
      if (key === '\x7f' || key === '\b') {
        if (filterQuery.length > 0) {
          filterQuery = filterQuery.slice(0, -1);
          refreshDisplayItems(displayItems[selected]);
          redraw();
        }
        return;
      }
      const typed = [...key].filter(c => c >= ' ' && c !== '\x7f').join('');
      if (typed) {
        filterQuery += typed;
        refreshDisplayItems(displayItems[selected]);
        redraw();
      }
    },
  });

  if (result) {
    const choice = modelPreference(result.item);
    setSelectedModel(choice);
    markModelSelected(result.item.providerId, result.item.modelId);
    clearModelNewFlag(result.item.providerId, result.item.modelId);
    if (result.saveDefault) saveDefaultModel(choice);
    console.log(chalk.blue(`Model set to: ${choice}`));
    if (result.saveDefault) console.log(chalk.green(`Default model set to: ${choice}`));
  }
  return true;
}
