import chalk from 'chalk';
import type { Interface } from 'readline';
import { getConfigPaths, readRawConfig, resolveApiKey, writeConfigFile } from '../config/index.js';
import { PROVIDER_REGISTRY, initDynamicProviders } from '../providers/registry.js';
import type { Config, ModelConfig, ProviderConfig } from '../providers/types.js';
import { getProviderCache, markModelSelected } from '../providers/model-cache.js';
import { getAnthropicVerifiedRates, getOpenAIVerifiedRates } from '../providers/pricing-verifier.js';
import type { PricingConfidence } from '../providers/pricing-verifier.js';

export interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  modelsSource?: 'static' | 'live';
  isNew?: boolean;
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

export async function getSelectableModels(): Promise<ModelMenuItem[]> {
  await initDynamicProviders();
  const items: ModelMenuItem[] = [];

  for (const provider of PROVIDER_REGISTRY) {
    if (!resolveApiKey(provider)) continue;
    addProviderModels(items, provider, provider.models);
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
): { itemLines: string[]; selectedLineIdx: number } {
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
    const pricingBadge = item.pricing
      ? (item.pricing.confidence === 'disagree'
          ? chalk.red(' sources disagree')
          : item.pricing.input !== null && item.pricing.output !== null
            ? (item.pricing.confidence === 'agreed'
                ? chalk.green(` ${formatPricingLabel(item.pricing.input, item.pricing.output)}`)
                : chalk.yellow(` ${formatPricingLabel(item.pricing.input, item.pricing.output)}`))
            : '')
      : '';
    itemLines.push(`  ${cursor} ${renderedName}${newBadge}${pricingBadge} ${chalk.dim(id)}${marker}`);
  }

  // trailing removed models for the last provider group
  if (lastProvider) {
    const removed = removedByProvider.get(lastProvider) ?? [];
    for (const id of removed) {
      itemLines.push(`    ${chalk.dim.strikethrough(id)} ${chalk.dim('(removed)')}`);
    }
  }

  return { itemLines, selectedLineIdx };
}

// Returns rendered lines and updated viewStart.
// Total line count is always fixed so cursor-up redraws stay stable.
function buildScreen(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  viewStart: number,
  removedByProvider: Map<string, string[]>,
): { lines: string[]; newViewStart: number } {
  const HEADER = 4;   // blank + title + hint + blank
  const CHROME = 3;   // top indicator + bottom indicator + trailing blank
  const termHeight = process.stdout.rows ?? 24;
  const maxItemLines = Math.max(4, termHeight - HEADER - CHROME);

  const { itemLines, selectedLineIdx } = buildAllItemLines(items, selected, currentModel, removedByProvider);

  // Scroll viewStart to keep selectedLineIdx visible
  let newViewStart = viewStart;
  if (selectedLineIdx < newViewStart) newViewStart = Math.max(0, selectedLineIdx - 2);
  if (selectedLineIdx >= newViewStart + maxItemLines) newViewStart = selectedLineIdx - maxItemLines + 1;
  newViewStart = Math.max(0, Math.min(newViewStart, Math.max(0, itemLines.length - maxItemLines)));

  const viewEnd = Math.min(newViewStart + maxItemLines, itemLines.length);
  const visibleLines = itemLines.slice(newViewStart, viewEnd);
  // Pad to maxItemLines so total output height is constant
  while (visibleLines.length < maxItemLines) visibleLines.push('');

  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Select model')}`);
  lines.push(`  ${chalk.dim('Up/Down navigate, Enter select, Space select + default, Esc close')}`);
  lines.push('');

  lines.push(newViewStart > 0 ? chalk.dim('  · · ·') : '');
  for (const line of visibleLines) lines.push(line);
  lines.push(viewEnd < itemLines.length ? chalk.dim('  · · ·') : '');

  lines.push('');
  return { lines, newViewStart };
}

export async function runModelCommand(
  rl: Interface,
  currentModel: string,
  setSelectedModel: (model: string) => void,
): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.red('Model picker requires an interactive terminal.'));
    return;
  }

  console.log(chalk.dim('Loading available models...'));
  const items = await getSelectableModels();

  if (items.length === 0) {
    console.log(chalk.red('No configured providers or local models are available.'));
    return;
  }

  const removedByProvider = new Map<string, string[]>();
  for (const provider of PROVIDER_REGISTRY) {
    if (provider.modelsSource === 'live') {
      const cached = getProviderCache(provider.id);
      if (cached?.removedIds.length) removedByProvider.set(provider.id, cached.removedIds);
    }
  }

  const currentIndex = items.findIndex(item => modelPreference(item) === currentModel);
  let selected = currentIndex >= 0 ? currentIndex : 0;
  let viewStart = 0;
  let lineCount = 1;

  function redraw(): void {
    const { lines, newViewStart } = buildScreen(items, selected, currentModel, viewStart, removedByProvider);
    viewStart = newViewStart;
    if (lineCount > 0) {
      process.stdout.write(`\x1b[${lineCount}A\r\x1b[J`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    lineCount = lines.length;
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

      if (data === '\x1b') {
        cleanup();
        resolve();
        return;
      }

      if (data === '\x1b[A') {
        selected = (selected - 1 + items.length) % items.length;
        redraw();
        return;
      }

      if (data === '\x1b[B') {
        selected = (selected + 1) % items.length;
        redraw();
        return;
      }

      if (data === '\r' || data === '\n') {
        const item = items[selected];
        const choice = modelPreference(item);
        setSelectedModel(choice);
        markModelSelected(item.providerId, item.modelId);
        cleanup();
        console.log(chalk.blue(`Model set to: ${choice}`));
        resolve();
      }

      if (data === ' ') {
        const item = items[selected];
        const choice = modelPreference(item);
        setSelectedModel(choice);
        saveDefaultModel(choice);
        markModelSelected(item.providerId, item.modelId);
        cleanup();
        console.log(chalk.blue(`Model set to: ${choice}`));
        console.log(chalk.green(`Default model set to: ${choice}`));
        resolve();
      }
    };

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (lineCount > 0) {
        process.stdout.write(`\x1b[${lineCount}A\r\x1b[J`);
      }
      process.stdout.write('\x1b[?25h');
      rl.resume();
    }

    process.stdin.on('data', onData);
  });
}
