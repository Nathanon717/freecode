export type PricingConfidence = 'agreed' | 'litellm-only' | 'openrouter-only' | 'disagree';

export interface VerifiedRates {
  confidence: PricingConfidence;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
}

export const LITELLM_PRICING_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const AGREE_TOLERANCE = 0.02;

type RateMap = Record<string, { input: number; output: number }>;

let litellmPromise: Promise<RateMap> | null = null;
let openrouterPromise: Promise<RateMap> | null = null;

async function fetchLiteLLM(): Promise<RateMap> {
  const res = await fetch(LITELLM_PRICING_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as Record<string, { input_cost_per_token?: number; output_cost_per_token?: number }>;
  const map: RateMap = {};
  for (const [key, entry] of Object.entries(json)) {
    const i = entry.input_cost_per_token;
    const o = entry.output_cost_per_token;
    if (typeof i === 'number' && typeof o === 'number') {
      map[key] = { input: i * 1_000_000, output: o * 1_000_000 };
    }
  }
  return map;
}

async function fetchOpenRouter(): Promise<RateMap> {
  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as { data: Array<{ id: string; pricing: { prompt: string; completion: string } }> };
  const map: RateMap = {};
  for (const model of json.data) {
    const input = parseFloat(model.pricing.prompt) * 1_000_000;
    const output = parseFloat(model.pricing.completion) * 1_000_000;
    if (Number.isFinite(input) && Number.isFinite(output) && input > 0) {
      map[model.id] = { input, output };
    }
  }
  return map;
}

export function getLiteLLMRates(): Promise<RateMap> {
  litellmPromise ??= fetchLiteLLM().catch(() => ({}));
  return litellmPromise;
}

export function getOpenRouterRates(): Promise<RateMap> {
  openrouterPromise ??= fetchOpenRouter().catch(() => ({}));
  return openrouterPromise;
}

function findRate(key: string, map: RateMap): { input: number; output: number } | undefined {
  if (map[key]) return map[key];
  const base = key.replace(/-(20\d{6,}|latest|preview)$/i, '').replace(/:.*$/, '');
  if (map[base]) return map[base];
  const keyVariants = rateKeyVariants(key);
  const baseVariants = rateKeyVariants(base);
  for (const variant of [...keyVariants, ...baseVariants]) {
    if (map[variant]) return map[variant];
  }
  for (const [k, v] of Object.entries(map)) {
    const kb = k.replace(/-(20\d{6,}|latest|preview)$/i, '').replace(/:.*$/, '');
    const mapVariants = rateKeyVariants(kb);
    if (
      kb === key
      || kb === base
      || mapVariants.some(variant => keyVariants.includes(variant) || baseVariants.includes(variant))
    ) return v;
  }
  const candidates = Object.keys(map).filter(k => k.startsWith(key + '-') || k.startsWith(base + '-'));
  if (candidates.length > 0) return map[candidates.sort().at(-1)!];
  return undefined;
}

function rateKeyVariants(key: string): string[] {
  const variants = new Set<string>();
  const withoutProviderPrefix = key.replace(/^[^/]+\//, '');
  for (const candidate of [key, withoutProviderPrefix]) {
    variants.add(candidate);
    variants.add(candidate.replace(/-(\d+)-(\d+)(?=$|[-_])/g, '-$1.$2'));
    variants.add(candidate.replace(/-(\d+)\.(\d+)(?=$|[-_])/g, '-$1-$2'));
  }
  return [...variants];
}

function withinTolerance(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true;
  return Math.abs(a - b) / ((a + b) / 2) <= AGREE_TOLERANCE;
}

export async function getVerifiedRates(litellmKey: string, openrouterKey: string): Promise<VerifiedRates> {
  const [llMap, orMap] = await Promise.all([getLiteLLMRates(), getOpenRouterRates()]);
  const ll = findRate(litellmKey, llMap);
  const or = findRate(openrouterKey, orMap);

  if (!ll && !or) return { confidence: 'disagree', inputPerMillion: null, outputPerMillion: null };
  if (ll && !or) return { confidence: 'litellm-only', inputPerMillion: ll.input, outputPerMillion: ll.output };
  if (!ll && or) return { confidence: 'openrouter-only', inputPerMillion: or.input, outputPerMillion: or.output };

  if (withinTolerance(ll!.input, or!.input) && withinTolerance(ll!.output, or!.output)) {
    return { confidence: 'agreed', inputPerMillion: ll!.input, outputPerMillion: ll!.output };
  }
  return { confidence: 'disagree', inputPerMillion: null, outputPerMillion: null };
}

export function getAnthropicVerifiedRates(modelId: string): Promise<VerifiedRates> {
  const base = modelId.replace(/^anthropic\//, '').replace(/-(20\d{6,}|latest)$/i, '').replace(/:.*$/, '');
  const key = `anthropic/${base}`;
  return getVerifiedRates(key, key);
}

export function getOpenAIVerifiedRates(modelId: string): Promise<VerifiedRates> {
  const base = modelId.replace(/^openai\//, '').replace(/-(20\d{6,}|latest|preview)$/i, '');
  return getVerifiedRates(base, `openai/${base}`);
}
