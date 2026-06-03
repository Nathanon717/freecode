import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, readRawConfig, resolveApiKey, writeConfigFile } from '../config/index.js';
import { PROVIDER_REGISTRY, initDynamicProviders } from '../providers/registry.js';
import type { Config, ModelConfig, ProviderConfig } from '../providers/types.js';
import { getProviderCache, markModelSelected } from '../providers/model-cache.js';
import { clearModelNewFlag } from '../providers/registry.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import type { PricingConfidence } from '../providers/pricing-verifier.js';
import { countWrappedLines, runRawPicker } from '../cli/raw-picker.js';
import { loadCanonicalGroups, type CanonicalModelGroups } from '../providers/canonical-models.js';
import { getNoNativeToolsModels } from '../providers/model-traits.js';

export interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  modelsSource?: 'static' | 'live';
  isNew?: boolean;
  noNativeTools?: boolean;
  pricing?: { input: number | null; output: number | null; confidence: PricingConfidence };
}

function modelPreference(item: ModelMenuItem): string {
  return `${item.providerId}:${item.modelId}`;
}

function formatPricingLabel(input: number, output: number): string {
  const fmt = (n: number): string => `$${parseFloat(n.toFixed(2))}`;
  return `${fmt(input)}/${fmt(output)}/MTok`;
}

function saveDefaultModel(model: string): void {
  const paths = getConfigPaths();
  const existing = readRawConfig(paths.globalPath) as Record<string, unknown> | null ?? {};
  delete existing['preferLocal'];
  writeConfigFile(paths.globalPath, {
    ...existing,
    defaultModel: model,
  } as Partial<Config>);
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

// Returns items in canonical-file order for the model-grouped tab view.
// Named groups (in file order) come first; then the "other" key; then anything not in the file.
function buildDisplayList(items: ModelMenuItem[], groupMode: GroupMode, canonicalGroups: CanonicalModelGroups): ModelMenuItem[] {
  if (groupMode !== 'model') return items;

  const itemByEntry = new Map<string, ModelMenuItem>();
  for (const item of items) {
    itemByEntry.set(`${item.providerId}:${item.modelId}`, item);
  }

  const result: ModelMenuItem[] = [];
  const placed = new Set<string>();

  for (const [groupName, members] of Object.entries(canonicalGroups)) {
    if (groupName === 'other') continue;
    for (const entry of members) {
      const item = itemByEntry.get(entry);
      if (item && !placed.has(entry)) {
        result.push(item);
        placed.add(entry);
      }
    }
  }

  for (const entry of (canonicalGroups['other'] ?? [])) {
    const item = itemByEntry.get(entry);
    if (item && !placed.has(entry)) {
      result.push(item);
      placed.add(entry);
    }
  }

  for (const item of items) {
    const key = `${item.providerId}:${item.modelId}`;
    if (!placed.has(key)) result.push(item);
  }

  return result;
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
  removedByProvider: Map<string, string[]>,
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

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const preference = modelPreference(item);
    const active = i === selected;
    const current = preference === currentModel;

    if (item.providerId !== lastProvider) {
      if (lastProvider) {
        const removed = removedByProvider.get(lastProvider) ?? [];
        for (const id of removed) {
          itemLines.push(`    ${chalk.dim.strikethrough(id)} ${chalk.dim('(removed)')}`);
        }
        itemLines.push('');
      }
      const liveBadge = item.modelsSource === 'live' ? chalk.dim('  · live') : '';
      itemLines.push(`  ${chalk.bold(item.providerName)}${liveBadge}`);
      lastProvider = item.providerId;
    }

    if (i === selected) selectedLineIdx = itemLines.length;

    const cursor = active ? chalk.cyan('>') : ' ';
    const id = `${item.providerId}:${item.modelId}`;
    const renderedName = active ? chalk.inverse(item.displayName) : chalk.cyan(item.displayName);
    const marker = current ? chalk.green(' current') : '';
    const newBadge = item.isNew ? chalk.yellow(' new') : '';
    const ptBadge = item.noNativeTools ? chalk.dim(' ~tools') : '';
    const pricingBadge = item.pricing
      ? (item.pricing.confidence === 'disagree'
          ? chalk.red(' sources disagree')
          : item.pricing.input !== null && item.pricing.output !== null
            ? (item.pricing.confidence === 'agreed'
                ? chalk.green(` ${formatPricingLabel(item.pricing.input, item.pricing.output)}`)
                : chalk.yellow(` ${formatPricingLabel(item.pricing.input, item.pricing.output)}`))
            : '')
      : '';
    itemLines.push(`  ${cursor} ${renderedName}${newBadge}${ptBadge}${pricingBadge}${showId ? ` ${chalk.dim(id)}` : ''}${marker}`);
  }

  if (lastProvider) {
    const removed = removedByProvider.get(lastProvider) ?? [];
    for (const id of removed) {
      itemLines.push(`    ${chalk.dim.strikethrough(id)} ${chalk.dim('(removed)')}`);
    }
  }

  return { itemLines, selectedLineIdx };
}

function buildModelGroupedItemLines(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  canonicalGroups: CanonicalModelGroups,
): { itemLines: string[]; selectedLineIdx: number } {
  // Reverse map: "provider:modelId" → group name (first match wins)
  const entryToGroup = new Map<string, string>();
  for (const [groupName, members] of Object.entries(canonicalGroups)) {
    for (const entry of members) {
      if (!entryToGroup.has(entry)) entryToGroup.set(entry, groupName);
    }
  }

  // Count distinct providers per named group to decide row display style.
  const groupProviders = new Map<string, Set<string>>();
  for (const item of items) {
    const group = entryToGroup.get(`${item.providerId}:${item.modelId}`);
    if (!group || group === 'other') continue;
    if (!groupProviders.has(group)) groupProviders.set(group, new Set());
    groupProviders.get(group)!.add(item.providerId);
  }

  const itemLines: string[] = [];
  let selectedLineIdx = 0;
  let lastGroup = '';
  let inOtherSection = false;

  for (let i = 0; i < items.length; i++) {
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

    if (i === selected) selectedLineIdx = itemLines.length;

    const preference = modelPreference(item);
    const active = i === selected;
    const current = preference === currentModel;
    const cursor = active ? chalk.cyan('>') : ' ';
    const marker = current ? chalk.green(' current') : '';
    const pricingBadge = item.pricing
      ? (item.pricing.confidence === 'disagree'
          ? chalk.red(' sources disagree')
          : item.pricing.input !== null && item.pricing.output !== null
            ? (item.pricing.confidence === 'agreed'
                ? chalk.green(` ${formatPricingLabel(item.pricing.input, item.pricing.output)}`)
                : chalk.yellow(` ${formatPricingLabel(item.pricing.input, item.pricing.output)}`))
            : '')
      : '';

    if (isNamed && (groupProviders.get(group)?.size ?? 1) >= 2) {
      // Multiple providers offer this model — show provider name per row.
      const renderedProvider = active ? chalk.inverse(item.providerName) : chalk.cyan(item.providerName);
      const ptBadge = item.noNativeTools ? chalk.dim(' ~tools') : '';
      itemLines.push(`  ${cursor} ${renderedProvider}${ptBadge}${pricingBadge} ${chalk.dim(item.providerId)}${marker}`);
    } else {
      const newBadge = item.isNew ? chalk.yellow(' new') : '';
      const ptBadge = item.noNativeTools ? chalk.dim(' ~tools') : '';
      const id = `${item.providerId}:${item.modelId}`;
      const renderedName = active ? chalk.inverse(item.displayName) : chalk.cyan(item.displayName);
      itemLines.push(`  ${cursor} ${renderedName}${newBadge}${ptBadge}${pricingBadge} ${chalk.dim(id)}${marker}`);
    }
  }

  return { itemLines, selectedLineIdx };
}

function buildScreen(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  viewStart: number,
  removedByProvider: Map<string, string[]>,
  groupMode: GroupMode,
  canonicalGroups: CanonicalModelGroups,
  filterQuery: string,
): { lines: string[]; newViewStart: number } {
  const HEADER = 5;
  const CHROME = 3;
  const termHeight = (process.stdout.rows ?? 24) - 2;
  const maxItemLines = Math.max(4, termHeight - HEADER - CHROME);

  const { itemLines: rawItemLines, selectedLineIdx } = buildAllItemLines(items, selected, currentModel, removedByProvider, groupMode, canonicalGroups);
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
  lines.push(`  ${tabHint}${chalk.dim('Up/Down navigate, Enter select, Space select + default, Esc close')}`);
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

  const removedByProvider = new Map<string, string[]>();
  for (const provider of PROVIDER_REGISTRY) {
    if (provider.modelsSource === 'live') {
      const cached = getProviderCache(provider.id);
      if (cached?.removedIds.length) removedByProvider.set(provider.id, cached.removedIds);
    }
  }

  const canonicalGroups = loadCanonicalGroups();
  let groupMode: GroupMode = 'pretty';
  let filterQuery = '';
  let unfilteredDisplayItems = buildDisplayList(items, groupMode, canonicalGroups);
  let displayItems = filterModelItems(unfilteredDisplayItems, filterQuery);
  const currentIndex = displayItems.findIndex(item => modelPreference(item) === currentModel);
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

    const preferredModel = preferred ? modelPreference(preferred) : undefined;
    const preferredIndex = preferredModel
      ? displayItems.findIndex(item => modelPreference(item) === preferredModel)
      : -1;
    if (preferredIndex >= 0) {
      selected = preferredIndex;
    } else {
      selected = Math.min(selected, displayItems.length - 1);
    }
  }

  const result = await runRawPicker<ModelPickResult>(rl, {
    render(): string[] {
      const { lines, newViewStart } = buildScreen(displayItems, selected, currentModel, viewStart, removedByProvider, groupMode, canonicalGroups, filterQuery);
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
