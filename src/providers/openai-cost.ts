import { formatUsdCeil, type CostEstimate, type CostEstimateBreakdown } from './anthropic-cost.js';
import type { VerifiedRates } from './pricing-verifier.js';

export const OPENAI_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

export type OpenAIPricingSource = 'live' | 'unavailable';

interface OpenAIModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

interface OpenAIPricingTable {
  source: OpenAIPricingSource;
  fetchedAt: string;
  models: Record<string, OpenAIModelPricing>;
}

let pricingPromise: Promise<OpenAIPricingTable> | null = null;
let sessionTotalUsd = 0;

export function resetOpenAISessionCost(): void {
  sessionTotalUsd = 0;
}

export function addOpenAISessionCost(estimate: CostEstimate | null | undefined): number {
  if (estimate?.usd !== null && estimate?.usd !== undefined) {
    sessionTotalUsd += estimate.usd;
  }
  return sessionTotalUsd;
}

export function getOpenAISessionCost(): number {
  return sessionTotalUsd;
}

type LiteLLMEntry = {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
};

export function parseLiteLLMPricing(json: Record<string, LiteLLMEntry>, fetchedAt = new Date().toISOString()): OpenAIPricingTable {
  // Keep only plain OpenAI entries (not azure/, bedrock/, vertex_ai/, etc.)
  const openaiEntries = Object.entries(json).filter(([key]) =>
    !key.includes('/') && (
      key.startsWith('gpt-') || key.startsWith('o1') || key.startsWith('o3') || key.startsWith('o4')
    )
  );

  if (openaiEntries.length === 0) throw new Error('No OpenAI entries found in LiteLLM pricing');

  const models: Record<string, OpenAIModelPricing> = {};
  for (const [key, entry] of openaiEntries) {
    if (typeof entry.input_cost_per_token !== 'number' || typeof entry.output_cost_per_token !== 'number') continue;
    models[key] = {
      inputPerMillion: entry.input_cost_per_token * 1_000_000,
      outputPerMillion: entry.output_cost_per_token * 1_000_000,
    };
  }

  if (Object.keys(models).length === 0) throw new Error('No usable OpenAI pricing entries found');

  return { source: 'live', fetchedAt, models };
}

export async function getOpenAIPricing(): Promise<OpenAIPricingTable> {
  pricingPromise ??= (async () => {
    try {
      const response = await fetch(OPENAI_PRICING_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json() as Record<string, LiteLLMEntry>;
      return parseLiteLLMPricing(json);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { source: 'unavailable', fetchedAt: new Date().toISOString(), models: {}, _fetchError: message } as OpenAIPricingTable & { _fetchError: string };
    }
  })();
  return pricingPromise;
}

function resolveModelKey(modelId: string, models: Record<string, OpenAIModelPricing>): string | undefined {
  // Exact match first
  if (models[modelId]) return modelId;

  // Strip known date/version suffixes from modelId then retry
  const stripped = modelId.replace(/-(20\d{6,}|latest|preview)$/, '');
  if (models[stripped]) return stripped;

  // Find LiteLLM key whose base (before date suffix) matches modelId or stripped
  for (const key of Object.keys(models)) {
    const keyBase = key.replace(/-(20\d{6,}|latest|preview)$/, '');
    if (keyBase === modelId || keyBase === stripped) return key;
  }

  // Prefix match: e.g. "gpt-4o" matches "gpt-4o-2024-08-06"
  const candidates = Object.keys(models).filter(k => k.startsWith(modelId + '-') || k.startsWith(stripped + '-'));
  if (candidates.length > 0) {
    // Pick the most recent (alphabetically last date suffix wins)
    return candidates.sort().at(-1);
  }

  return undefined;
}

export function estimateOpenAICost(
  modelId: string,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  pricingTable: OpenAIPricingTable
): CostEstimate {
  if (promptTokens === undefined || completionTokens === undefined) {
    return unavailable(pricingTable, ['token usage unavailable']);
  }

  if (pricingTable.source === 'unavailable') {
    const err = (pricingTable as OpenAIPricingTable & { _fetchError?: string })._fetchError;
    return unavailable(pricingTable, [err ? `pricing fetch failed: ${err}` : 'pricing unavailable']);
  }

  const key = resolveModelKey(modelId, pricingTable.models);
  if (!key) {
    return unavailable(pricingTable, [`pricing unavailable for model ${modelId}`]);
  }

  const p = pricingTable.models[key];
  const inputUsd = (promptTokens * p.inputPerMillion) / 1_000_000;
  const outputUsd = (completionTokens * p.outputPerMillion) / 1_000_000;
  const usd = inputUsd + outputUsd;

  const breakdown: CostEstimateBreakdown = {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    cacheReadTokens: 0,
    inputPerMillion: p.inputPerMillion,
    outputPerMillion: p.outputPerMillion,
    cacheWrite5mPerMillion: 0,
    cacheWrite1hPerMillion: 0,
    cacheReadPerMillion: 0,
    inputUsd,
    outputUsd,
    cacheWrite5mUsd: 0,
    cacheWrite1hUsd: 0,
    cacheReadUsd: 0,
    multiplier: 1,
  };

  return {
    usd,
    formattedUsd: formatUsdCeil(usd),
    source: 'live',
    sourceUrl: OPENAI_PRICING_URL,
    fetchedAt: pricingTable.fetchedAt,
    breakdown,
    warnings: key !== modelId ? [`matched ${modelId} to ${key}`] : [],
  };
}


function unavailable(table: OpenAIPricingTable, warnings: string[]): CostEstimate {
  return {
    usd: null,
    formattedUsd: 'cost unavailable',
    source: 'fallback',
    sourceUrl: OPENAI_PRICING_URL,
    fetchedAt: table.fetchedAt,
    warnings,
  };
}

export function estimateOpenAICostVerified(
  modelId: string,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  rates: VerifiedRates
): CostEstimate {
  if (rates.confidence === 'disagree' || rates.inputPerMillion === null || rates.outputPerMillion === null) {
    return {
      usd: null,
      formattedUsd: 'cost unavailable',
      source: 'live',
      sourceUrl: '',
      fetchedAt: new Date().toISOString(),
      confidence: 'disagree',
      warnings: [],
    };
  }

  if (promptTokens === undefined || completionTokens === undefined) {
    return {
      usd: null,
      formattedUsd: 'cost unavailable',
      source: 'live',
      sourceUrl: '',
      fetchedAt: new Date().toISOString(),
      confidence: rates.confidence,
      warnings: ['token usage unavailable'],
    };
  }

  const inputUsd = (promptTokens * rates.inputPerMillion) / 1_000_000;
  const outputUsd = (completionTokens * rates.outputPerMillion) / 1_000_000;
  const usd = inputUsd + outputUsd;

  const breakdown: CostEstimateBreakdown = {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    cacheReadTokens: 0,
    inputPerMillion: rates.inputPerMillion,
    outputPerMillion: rates.outputPerMillion,
    cacheWrite5mPerMillion: 0,
    cacheWrite1hPerMillion: 0,
    cacheReadPerMillion: 0,
    inputUsd,
    outputUsd,
    cacheWrite5mUsd: 0,
    cacheWrite1hUsd: 0,
    cacheReadUsd: 0,
    multiplier: 1,
  };

  return {
    usd,
    formattedUsd: formatUsdCeil(usd),
    source: 'live',
    sourceUrl: '',
    fetchedAt: new Date().toISOString(),
    breakdown,
    confidence: rates.confidence,
    warnings: [],
  };
}

export function estimateOpenAIInputCostVerified(
  inputTokens: number,
  rates: VerifiedRates
): { inputUsd: number | null; formattedInputUsd: string; warning?: string } {
  if (rates.confidence === 'disagree' || rates.inputPerMillion === null) {
    return {
      inputUsd: null,
      formattedInputUsd: 'input cost unavailable',
      warning: 'pricing unavailable or disputed',
    };
  }

  const inputUsd = (inputTokens * rates.inputPerMillion) / 1_000_000;
  return {
    inputUsd,
    formattedInputUsd: formatUsdCeil(inputUsd),
  };
}
