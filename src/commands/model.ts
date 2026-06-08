import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, loadConfig, readRawConfig, resolveApiKey, writeConfigFile } from '../config/index.js';
import { PROVIDER_REGISTRY, initDynamicProviders } from '../providers/registry.js';
import type { ModelConfig, ProviderConfig } from '../providers/types.js';
import { markModelSelected } from '../providers/model-cache.js';
import { clearModelNewFlag } from '../providers/registry.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import type { PricingConfidence } from '../providers/pricing-verifier.js';
import { countWrappedLines, runRawPicker } from '../cli/raw-picker.js';
import { loadCanonicalGroups, type CanonicalModelGroups } from '../providers/canonical-models.js';
import { getNoNativeToolsModels } from '../providers/model-traits.js';
import { loadEvalDotsData, buildEvalDots, type EvalDotsData } from '../cli/eval-dots.js';

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

function saveDefaultModel(model: string): void {
  const paths = getConfigPaths();
  const existing = readRawConfig(paths.globalPath) ?? {};
  delete (existing as Record<string, unknown>)['preferLocal'];
  writeConfigFile(paths.globalPath, {
    ...existing,
    defaultModel: model,
  });
}

function loadFavorites(): Set<string> {
  const paths = getConfigPaths();
  const raw = readRawConfig(paths.globalPath) as Record<string, unknown> | null;
  const favs = raw?.['favoriteModels'];
  return new Set(Array.isArray(favs) ? favs : []);
}

function saveFavorites(favorites: Set<string>): void {
  const paths = getConfigPaths();
  const existing = readRawConfig(paths.globalPath) ?? {};
  delete (existing as Record<string, unknown>)['preferLocal'];
  writeConfigFile(paths.globalPath, {
    ...existing,
    favoriteModels: [...favorites],
  });
}

function sortItemsByFavorites(items: ModelMenuItem[]): void {
  const byProvider = new Map<string, ModelMenuItem[]>();
  const providerOrder: string[] = [];
  for (const item of items) {
    if (!byProvider.has(item.providerId)) {
      byProvider.set(item.providerId, []);
      providerOrder.push(item.providerId);
    }
    byProvider.get(item.providerId)!.push(item);
  }
  let idx = 0;
  for (const pid of providerOrder) {
    const group = byProvider.get(pid)!;
    const favs = group.filter(x => x.isFavorite);
    const rest = group.filter(x => !x.isFavorite);
    for (const item of [...favs, ...rest]) items[idx++] = item;
  }
}

type GroupMode = 'pretty' | 'provider' | 'model';

function addProviderModels(items: ModelMenuItem[], provider: ProviderConfig, models: ModelConfig[]): void {
  for (const model of models) {
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

// Returns provider-section items in canonical-file order for model-grouped tab view.
function buildModelGroupedOrder(items: ModelMenuItem[], canonicalGroups: CanonicalModelGroups): ModelMenuItem[] {
  const itemByEntry = new Map<string, ModelMenuItem>();
  for (const item of items) {
    itemByEntry.set(`${item.providerId}:${item.modelId}`, item);
  }

  const result: ModelMenuItem[] = [];
  const placed = new Set<string>();

  for (const [groupName, members] of Object.entries(canonicalGroups)) {
    if (groupName === 'other') continue;
    const groupItems = members
      .map(e => itemByEntry.get(e))
      .filter((item): item is ModelMenuItem => !!item && !placed.has(`${item.providerId}:${item.modelId}`));
    groupItems.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
    for (const item of groupItems) {
      result.push(item);
      placed.add(`${item.providerId}:${item.modelId}`);
    }
  }

  const otherItems = (canonicalGroups['other'] ?? [])
    .map(e => itemByEntry.get(e))
    .filter((item): item is ModelMenuItem => !!item && !placed.has(`${item.providerId}:${item.modelId}`));
  otherItems.sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
  for (const item of otherItems) {
    result.push(item);
    placed.add(`${item.providerId}:${item.modelId}`);
  }

  for (const item of items) {
    const key = `${item.providerId}:${item.modelId}`;
    if (!placed.has(key)) result.push(item);
  }

  return result;
}

// Builds the flat displayItems list. Favorites appear twice: once as _favSection=true entries
// at the front (Favorites section), and once as regular entries in their provider/model section.
// This makes every visual row independently selectable via Up/Down.
function buildDisplayList(items: ModelMenuItem[], groupMode: GroupMode, canonicalGroups: CanonicalModelGroups): ModelMenuItem[] {
  const orderedItems = groupMode === 'model' ? buildModelGroupedOrder(items, canonicalGroups) : items;
  const favSectionItems = orderedItems
    .filter(x => x.isFavorite)
    .map(x => ({ ...x, _favSection: true }));
  return [...favSectionItems, ...orderedItems];
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
  await initDynamicProviders();
  const items: ModelMenuItem[] = [];

  for (const provider of PROVIDER_REGISTRY) {
    if (!resolveApiKey(provider)) continue;
    addProviderModels(items, provider, provider.models);
  }

  const noNativeTools = getNoNativeToolsModels();
  for (const item of items) {
    if (noNativeTools.has(`${item.providerId}:${item.modelId}`)) {
      item.noNativeTools = true;
    }
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
  canonicalGroups: CanonicalModelGroups = {},
): { itemLines: string[]; selectedLineIdx: number } {
  if (groupMode === 'model') {
    return buildModelGroupedItemLines(items, selected, currentModel, canonicalGroups);
  }

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

function buildModelGroupedItemLines(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  canonicalGroups: CanonicalModelGroups,
): { itemLines: string[]; selectedLineIdx: number } {
  const entryToGroup = new Map<string, string>();
  for (const [groupName, members] of Object.entries(canonicalGroups)) {
    for (const entry of members) {
      if (!entryToGroup.has(entry)) entryToGroup.set(entry, groupName);
    }
  }

  // Skip _favSection duplicates when counting providers per group.
  const groupProviders = new Map<string, Set<string>>();
  for (const item of items) {
    if (item._favSection) continue;
    const group = entryToGroup.get(`${item.providerId}:${item.modelId}`);
    if (!group || group === 'other') continue;
    if (!groupProviders.has(group)) groupProviders.set(group, new Set());
    groupProviders.get(group)!.add(item.providerId);
  }

  const itemLines: string[] = [];
  let selectedLineIdx = 0;
  let lastGroup = '';
  let inOtherSection = false;

  // Favorites section
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
    lastGroup = '';
  }

  // Model-grouped section
  for (let i = 0; i < items.length; i++) {
    if (items[i]._favSection) continue;
    const item = items[i];
    const entry = `${item.providerId}:${item.modelId}`;
    const group = entryToGroup.get(entry) ?? 'other';
    const isNamed = group !== 'other';

    if (!isNamed && !inOtherSection) {
      if (lastGroup) itemLines.push('');
      itemLines.push(`  ${chalk.bold('Other')}`);
      inOtherSection = true;
      lastGroup = 'other';
    }

    if (isNamed && group !== lastGroup) {
      if (lastGroup) itemLines.push('');
      const provCount = groupProviders.get(group)?.size ?? 1;
      itemLines.push(`  ${chalk.bold(group)} ${chalk.dim(`· ${provCount} provider${provCount !== 1 ? 's' : ''}`)}`);
      lastGroup = group;
    }

    const active = i === selected;
    if (active) selectedLineIdx = itemLines.length;
    const pref = modelPreference(item);
    const current = pref === currentModel;
    const cursor = active ? chalk.cyan('>') : ' ';
    const marker = current ? chalk.green(' current') : '';
    const favBadge = item.isFavorite ? chalk.yellow(' ★') : '';
    const pricingBadge = buildPricingBadge(item.pricing);
    const dotsBadge = item.evalDots ? ` ${item.evalDots}` : '';

    if (isNamed && (groupProviders.get(group)?.size ?? 1) >= 2) {
      const renderedProvider = active
        ? chalk.inverse(item.providerName)
        : item.isFavorite
          ? chalk.yellow(item.providerName)
          : chalk.cyan(item.providerName);
      const ptBadge = item.noNativeTools ? chalk.dim(' ~tools') : '';
      itemLines.push(`  ${cursor} ${renderedProvider}${favBadge}${ptBadge}${pricingBadge} ${chalk.dim(item.providerId)}${dotsBadge}${marker}`);
    } else {
      const newBadge = item.isNew ? chalk.yellow(' new') : '';
      const ptBadge = item.noNativeTools ? chalk.dim(' ~tools') : '';
      const id = `${item.providerId}:${item.modelId}`;
      const renderedName = active
        ? chalk.inverse(item.displayName)
        : item.isFavorite
          ? chalk.yellow(item.displayName)
          : chalk.cyan(item.displayName);
      itemLines.push(`  ${cursor} ${renderedName}${favBadge}${newBadge}${ptBadge}${pricingBadge} ${chalk.dim(id)}${dotsBadge}${marker}`);
    }
  }

  return { itemLines, selectedLineIdx };
}

function buildScreen(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  viewStart: number,
  groupMode: GroupMode,
  canonicalGroups: CanonicalModelGroups,
  filterQuery: string,
): { lines: string[]; newViewStart: number } {
  const HEADER = 5;
  const CHROME = 3;
  const termHeight = (process.stdout.rows ?? 24) - 2;
  const maxItemLines = Math.max(4, termHeight - HEADER - CHROME);

  const { itemLines: rawItemLines, selectedLineIdx } = buildAllItemLines(items, selected, currentModel, groupMode, canonicalGroups);
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
    : groupMode === 'provider'
      ? chalk.dim('Tab group by model, ')
      : chalk.dim('Tab clean view, ');
  const filterLabel = filterQuery
    ? `${chalk.dim('Filter: ')}${chalk.cyan(filterQuery)}`
    : chalk.dim('Type to filter, Backspace clears characters');
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Select model')}`);
  lines.push(`  ${filterLabel}`);
  lines.push(`  ${tabHint}${chalk.dim('Up/Down navigate, ←/→ toggle favorite, Enter select, Space select + default, Esc close')}`);
  lines.push('');

  lines.push(newViewStart > 0 ? chalk.dim('  · · ·') : '');
  for (const line of visibleLines) lines.push(line);
  lines.push(viewEnd < itemLines.length ? chalk.dim('  · · ·') : '');

  lines.push('');
  return { lines, newViewStart };
}

type ModelPickResult = { item: ModelMenuItem; saveDefault: boolean } | null;

function printableChars(key: string): string {
  return [...key].filter(c => c >= ' ' && c !== '\x7f').join('');
}

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

  const canonicalGroups = loadCanonicalGroups();

  if (loadConfig().showEvalDots) {
    const evalData: EvalDotsData = loadEvalDotsData();
    for (const item of items) {
      const model = `${item.providerId}:${item.modelId}`;
      item.evalDots = buildEvalDots(model, evalData, canonicalGroups);
    }
  }

  const favorites = loadFavorites();
  for (const item of items) {
    item.isFavorite = favorites.has(modelPreference(item));
  }
  sortItemsByFavorites(items);

  let groupMode: GroupMode = 'pretty';
  let filterQuery = '';
  let unfilteredDisplayItems = buildDisplayList(items, groupMode, canonicalGroups);
  let displayItems = filterModelItems(unfilteredDisplayItems, filterQuery);
  // Find current model; prefer the provider-section copy (not _favSection) for initial position.
  const currentPref = currentModel;
  let currentIndex = displayItems.findIndex(item => modelPreference(item) === currentPref && !item._favSection);
  if (currentIndex < 0) currentIndex = displayItems.findIndex(item => modelPreference(item) === currentPref);
  let selected = currentIndex >= 0 ? currentIndex : 0;
  let viewStart = 0;

  function refreshDisplayItems(preferred?: ModelMenuItem): void {
    unfilteredDisplayItems = buildDisplayList(items, groupMode, canonicalGroups);
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
      const { lines, newViewStart } = buildScreen(displayItems, selected, currentModel, viewStart, groupMode, canonicalGroups, filterQuery);
      viewStart = newViewStart;
      return lines;
    },
    countLines: countWrappedLines,
    onKey(key, redraw, close) {
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
      if (key === '\x1b[C' || key === '\x1b[D') {
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
          saveFavorites(favorites);
          sortItemsByFavorites(items);
          refreshDisplayItems(item);
          redraw();
        }
        return;
      }
      if (key === '\r' || key === '\n') {
        if (displayItems.length > 0) close({ item: displayItems[selected], saveDefault: false });
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
        const cycle: GroupMode[] = ['pretty', 'provider', 'model'];
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
      const typed = printableChars(key);
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
