export const ANTHROPIC_PRICING_URL = 'https://platform.claude.com/docs/en/about-claude/pricing';
export const ANTHROPIC_USAGE_COST_URL = 'https://docs.anthropic.com/en/api/data-usage-cost-api';

export type AnthropicPricingSource = 'live' | 'fallback';

export interface AnthropicTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheCreation5mInputTokens: number;
  cacheCreation1hInputTokens: number;
  cacheReadInputTokens: number;
  serverToolUse?: Record<string, number>;
  hasRawUsage: boolean;
  inferenceGeo?: string;
}

export interface AnthropicModelPricing {
  modelName: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWrite5mPerMillion: number;
  cacheWrite1hPerMillion: number;
  cacheReadPerMillion: number;
}

export interface AnthropicPricingTable {
  source: AnthropicPricingSource;
  sourceUrl: string;
  fetchedAt: string;
  updatedAt?: string;
  models: Record<string, AnthropicModelPricing>;
}

export interface CostEstimateBreakdown {
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWrite5mPerMillion: number;
  cacheWrite1hPerMillion: number;
  cacheReadPerMillion: number;
  inputUsd: number;
  outputUsd: number;
  cacheWrite5mUsd: number;
  cacheWrite1hUsd: number;
  cacheReadUsd: number;
  multiplier: number;
}

export interface CostEstimate {
  usd: number | null;
  formattedUsd: string;
  source: AnthropicPricingSource;
  sourceUrl: string;
  fetchedAt: string;
  updatedAt?: string;
  breakdown?: CostEstimateBreakdown;
  warnings: string[];
}

const FALLBACK_PRICING_FETCHED_AT = '2026-05-19T00:00:00.000Z';

const FALLBACK_MODELS: Record<string, AnthropicModelPricing> = {
  'claude-opus-4-7': pricing('Claude Opus 4.7', 5, 25),
  'claude-opus-4-6': pricing('Claude Opus 4.6', 5, 25),
  'claude-opus-4-5': pricing('Claude Opus 4.5', 5, 25),
  'claude-opus-4-1': pricing('Claude Opus 4.1', 15, 75),
  'claude-opus-4': pricing('Claude Opus 4', 15, 75),
  'claude-sonnet-4-6': pricing('Claude Sonnet 4.6', 3, 15),
  'claude-sonnet-4-5': pricing('Claude Sonnet 4.5', 3, 15),
  'claude-sonnet-4': pricing('Claude Sonnet 4', 3, 15),
  'claude-haiku-4-5': pricing('Claude Haiku 4.5', 1, 5),
  'claude-haiku-3-5': pricing('Claude Haiku 3.5', 0.8, 4),
};

let pricingPromise: Promise<AnthropicPricingTable> | null = null;
let sessionTotalUsd = 0;

function pricing(modelName: string, inputPerMillion: number, outputPerMillion: number): AnthropicModelPricing {
  return {
    modelName,
    inputPerMillion,
    outputPerMillion,
    cacheWrite5mPerMillion: inputPerMillion * 1.25,
    cacheWrite1hPerMillion: inputPerMillion * 2,
    cacheReadPerMillion: inputPerMillion * 0.1,
  };
}

export function resetAnthropicSessionCost(): void {
  sessionTotalUsd = 0;
}

export function addAnthropicSessionCost(estimate: CostEstimate | null | undefined): number {
  if (estimate?.usd !== null && estimate?.usd !== undefined) {
    sessionTotalUsd += estimate.usd;
  }
  return sessionTotalUsd;
}

export function getAnthropicSessionCost(): number {
  return sessionTotalUsd;
}

export function formatUsdCeil(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return 'cost unavailable';
  if (usd === 0) return '$0.000000 USD';
  const precision = usd < 0.01 ? 6 : 4;
  const factor = 10 ** precision;
  return `$${(Math.ceil(usd * factor) / factor).toFixed(precision)} USD`;
}

export function describeCostEstimate(estimate: CostEstimate | null | undefined): string {
  if (!estimate || estimate.usd === null) return 'cost unavailable';
  const source = estimate.source === 'fallback' ? ' (fallback pricing)' : '';
  const warnings = estimate.warnings.length > 0 ? ` (${estimate.warnings.join('; ')})` : '';
  return `${estimate.formattedUsd}${source}${warnings}`;
}

export function describeCostEstimateBreakdown(estimate: CostEstimate | null | undefined): string | null {
  if (!estimate) return null;
  if (!estimate.breakdown) {
    return estimate.warnings.length > 0
      ? `Cost details unavailable: ${estimate.warnings.join('; ')}`
      : 'Cost details unavailable';
  }

  const { breakdown } = estimate;
  const parts = [
    costPart('input', breakdown.inputTokens, breakdown.inputPerMillion, breakdown.inputUsd),
    costPart('output', breakdown.outputTokens, breakdown.outputPerMillion, breakdown.outputUsd),
    costPart('cache write 5m', breakdown.cacheWrite5mTokens, breakdown.cacheWrite5mPerMillion, breakdown.cacheWrite5mUsd),
    costPart('cache write 1h', breakdown.cacheWrite1hTokens, breakdown.cacheWrite1hPerMillion, breakdown.cacheWrite1hUsd),
    costPart('cache read', breakdown.cacheReadTokens, breakdown.cacheReadPerMillion, breakdown.cacheReadUsd),
  ].filter((part): part is string => part !== null);

  const source = estimate.source === 'fallback' ? 'fallback pricing' : 'live pricing';
  const multiplier = breakdown.multiplier !== 1 ? `, ${breakdown.multiplier.toFixed(1)}x US inference multiplier` : '';
  const warnings = estimate.warnings.length > 0 ? `; ${estimate.warnings.join('; ')}` : '';
  return `Cost breakdown: ${parts.join(' + ')} (${source}${multiplier}${warnings})`;
}

function costPart(label: string, tokens: number, ratePerMillion: number, usd: number): string | null {
  if (tokens === 0 && usd === 0) return null;
  return `${label} ${formatTokenCount(tokens)} tok @ $${ratePerMillion}/MTok = ${formatUsdCeil(usd)}`;
}

function formatTokenCount(tokens: number): string {
  return Math.ceil(tokens).toLocaleString('en-US');
}

function fallbackPricingTable(reason?: string): AnthropicPricingTable {
  return {
    source: 'fallback',
    sourceUrl: ANTHROPIC_PRICING_URL,
    fetchedAt: FALLBACK_PRICING_FETCHED_AT,
    updatedAt: reason,
    models: FALLBACK_MODELS,
  };
}

function normalizeModelKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-(20\d{6,}|latest)$/g, '')
    .replace(/^-+|-+$/g, '');
}

export function modelPricingKey(modelId: string): string {
  const normalized = normalizeModelKey(modelId);
  const match = normalized.match(/claude-(opus|sonnet|haiku)-(\d)-(\d)/);
  if (match) return `claude-${match[1]}-${match[2]}-${match[3]}`;
  return normalized;
}

function dollars(value: string): number {
  return Number(value.replace(/[$,\s]/g, ''));
}

export function parseAnthropicPricingHtml(html: string, fetchedAt = new Date().toISOString()): AnthropicPricingTable {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

  const rowPattern = /(Claude\s+(?:Opus|Sonnet|Haiku)\s+\d(?:\.\d)?)(?:\s+\([^)]*\))?\s*\$([\d.]+)\s*\/\s*MTok\s*\$([\d.]+)\s*\/\s*MTok\s*\$([\d.]+)\s*\/\s*MTok\s*\$([\d.]+)\s*\/\s*MTok\s*\$([\d.]+)\s*\/\s*MTok/gi;
  const models: Record<string, AnthropicModelPricing> = {};
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(text)) !== null) {
    const modelName = match[1].replace(/\s+/g, ' ').trim();
    models[normalizeModelKey(modelName)] = {
      modelName,
      inputPerMillion: dollars(match[2]),
      cacheWrite5mPerMillion: dollars(match[3]),
      cacheWrite1hPerMillion: dollars(match[4]),
      cacheReadPerMillion: dollars(match[5]),
      outputPerMillion: dollars(match[6]),
    };
  }

  if (Object.keys(models).length === 0) {
    throw new Error('No Anthropic model pricing rows found');
  }

  return {
    source: 'live',
    sourceUrl: ANTHROPIC_PRICING_URL,
    fetchedAt,
    models,
  };
}

export async function getAnthropicPricing(): Promise<AnthropicPricingTable> {
  pricingPromise ??= (async () => {
    try {
      const response = await fetch(ANTHROPIC_PRICING_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseAnthropicPricingHtml(await response.text());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fallbackPricingTable(`live fetch failed: ${message}`);
    }
  })();
  return pricingPromise;
}

export function estimateAnthropicCost(
  modelId: string,
  usage: AnthropicTokenUsage | null | undefined,
  pricingTable: AnthropicPricingTable
): CostEstimate {
  const warnings: string[] = [];
  if (!usage?.hasRawUsage) {
    return unavailable(pricingTable, ['raw Anthropic usage unavailable']);
  }

  const modelPricing = pricingTable.models[modelPricingKey(modelId)];
  if (!modelPricing) {
    return unavailable(pricingTable, [`pricing unavailable for model ${modelId}`]);
  }

  if (usage.cacheCreationInputTokens > 0 && usage.cacheCreation5mInputTokens === 0 && usage.cacheCreation1hInputTokens === 0) {
    warnings.push('legacy cache write tokens treated as 5m cache writes');
  }

  if (usage.serverToolUse && Object.values(usage.serverToolUse).some((value) => value > 0)) {
    warnings.push('partial estimate unavailable: server-side tool usage may have separate charges');
  }

  const multiplier = usage.inferenceGeo === 'us' ? 1.1 : 1;
  const cacheWrite5mTokens = usage.cacheCreation5mInputTokens + usage.cacheCreationInputTokens;
  const inputUsd = usage.inputTokens * modelPricing.inputPerMillion / 1_000_000 * multiplier;
  const outputUsd = usage.outputTokens * modelPricing.outputPerMillion / 1_000_000 * multiplier;
  const cacheWrite5mUsd = cacheWrite5mTokens * modelPricing.cacheWrite5mPerMillion / 1_000_000 * multiplier;
  const cacheWrite1hUsd = usage.cacheCreation1hInputTokens * modelPricing.cacheWrite1hPerMillion / 1_000_000 * multiplier;
  const cacheReadUsd = usage.cacheReadInputTokens * modelPricing.cacheReadPerMillion / 1_000_000 * multiplier;
  const usd = inputUsd + outputUsd + cacheWrite5mUsd + cacheWrite1hUsd + cacheReadUsd;

  return {
    usd,
    formattedUsd: formatUsdCeil(usd),
    source: pricingTable.source,
    sourceUrl: pricingTable.sourceUrl,
    fetchedAt: pricingTable.fetchedAt,
    updatedAt: pricingTable.updatedAt,
    breakdown: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheWrite5mTokens,
      cacheWrite1hTokens: usage.cacheCreation1hInputTokens,
      cacheReadTokens: usage.cacheReadInputTokens,
      inputPerMillion: modelPricing.inputPerMillion,
      outputPerMillion: modelPricing.outputPerMillion,
      cacheWrite5mPerMillion: modelPricing.cacheWrite5mPerMillion,
      cacheWrite1hPerMillion: modelPricing.cacheWrite1hPerMillion,
      cacheReadPerMillion: modelPricing.cacheReadPerMillion,
      inputUsd,
      outputUsd,
      cacheWrite5mUsd,
      cacheWrite1hUsd,
      cacheReadUsd,
      multiplier,
    },
    warnings,
  };
}

function unavailable(pricingTable: AnthropicPricingTable, warnings: string[]): CostEstimate {
  return {
    usd: null,
    formattedUsd: 'cost unavailable',
    source: pricingTable.source,
    sourceUrl: pricingTable.sourceUrl,
    fetchedAt: pricingTable.fetchedAt,
    updatedAt: pricingTable.updatedAt,
    warnings,
  };
}
