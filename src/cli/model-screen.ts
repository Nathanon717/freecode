import chalk from 'chalk';
import type { PricingConfidence } from '../providers/pricing-verifier.js';
import { getBannerColor, getBannerColorRGB } from './banner.js';

export interface ModelMenuItem {
  providerId: string;
  providerName: string;
  modelId: string;
  displayName: string;
  modelsSource?: 'static' | 'live';
  isNew?: boolean;
  noNativeTools?: boolean;
  isFavorite?: boolean;
  pricing?: { input: number | null; output: number | null; confidence: PricingConfidence };
  evalDots?: string;
  rateLimits?: { buckets: Record<string, { limit: number; intervalMs: number | null }>; observedAt: string };
}

export function modelPreference(item: ModelMenuItem): string {
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

export function sortItemsAlphabetically(items: ModelMenuItem[]): void {
  const providers = [...new Set(items.map(x => x.providerId))];
  let idx = 0;
  for (const pid of providers) {
    const group = items.filter(x => x.providerId === pid);
    const sorted = [...group].sort((a, b) => a.displayName.localeCompare(b.displayName));
    for (const item of sorted) items[idx++] = item;
  }
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

export function buildAllItemLines(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  showProviderHeaders = true,
): { itemLines: string[]; selectedLineIdx: number } {
  const itemLines: string[] = [];
  let lastProvider = '';
  let selectedLineIdx = 0;
  const bannerColor = getBannerColor();
  const [br, bg, bb] = getBannerColorRGB();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (item.providerId !== lastProvider) {
      if (showProviderHeaders) {
        if (lastProvider) itemLines.push('');
        const staticBadge = item.modelsSource !== 'live' ? chalk.dim('  · static') : '';
        itemLines.push(`  ${chalk.bold(item.providerName)}${staticBadge}`);
      }
      lastProvider = item.providerId;
    }

    const active = i === selected;
    if (active) selectedLineIdx = itemLines.length;
    const pref = modelPreference(item);
    const current = pref === currentModel;
    const cursor = active ? bannerColor('▶') : current ? chalk.green('▶') : ' ';
    const isFavTab = item.isFavorite && !showProviderHeaders;
    const renderedName = active
      ? isFavTab
        ? chalk.bgYellow.black(item.displayName)
        : chalk.bgRgb(br, bg, bb).black(item.displayName)
      : isFavTab
        ? chalk.yellow(item.displayName)
        : bannerColor(item.displayName);
    const newBadge = item.isNew ? chalk.yellow(' new') : '';
    const ptBadge = item.noNativeTools ? chalk.dim(' ~tools') : '';
    const pricingBadge = buildPricingBadge(item.pricing);
    const dotsBadge = item.evalDots ? ` ${item.evalDots}` : '';
    itemLines.push(`  ${cursor} ${renderedName}${newBadge}${ptBadge}${pricingBadge}${dotsBadge}`);
  }

  return { itemLines, selectedLineIdx };
}

export function buildScreen(
  items: ModelMenuItem[],
  selected: number,
  currentModel: string,
  viewStart: number,
  filterQuery: string,
  reserveRows = 0,
  showProviderHeaders = true,
): { lines: string[]; newViewStart: number; selectedScreenIdx: number } {
  const HEADER = 2;
  const CHROME = 3;
  const termHeight = (process.stdout.rows ?? 24) - 2;
  const maxItemLines = Math.max(4, termHeight - HEADER - CHROME - reserveRows);

  const { itemLines: rawItemLines, selectedLineIdx } = buildAllItemLines(items, selected, currentModel, showProviderHeaders);
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

  const filterLabel = filterQuery
    ? `${chalk.dim('type to ')}${getBannerColor().bold('filter')} ${chalk.white(filterQuery)}`
    : chalk.dim('type to filter');
  const lines: string[] = [];
  lines.push(`  ${filterLabel}`);

  // Header is 1 line (index 0), then scroll indicator at index 1, items at 2+.
  // The indicators count the clipped rows so off-screen models are obvious.
  const hiddenAbove = newViewStart;
  const hiddenBelow = itemLines.length - viewEnd;
  lines.push(hiddenAbove > 0 ? chalk.dim(`  ↑ ${hiddenAbove} more above`) : '');
  for (const line of visibleLines) lines.push(line);
  lines.push(hiddenBelow > 0 ? chalk.dim(`  ↓ ${hiddenBelow} more below`) : '');

  lines.push('');
  const selectedScreenIdx = 2 + (selectedLineIdx - newViewStart);
  return { lines, newViewStart, selectedScreenIdx };
}

export function buildModelDetailScreen(item: ModelMenuItem): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${getBannerColor().bold('Model details')}`);
  lines.push(`  ${chalk.dim('← or Esc back')}`);
  lines.push('');
  lines.push(`  ${chalk.bold('ID')}          ${getBannerColor()(`${item.providerId}:${item.modelId}`)}`);
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
