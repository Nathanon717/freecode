export interface OpenAIDailySpend {
  state: 'idle' | 'pending' | 'ready' | 'unavailable';
  amountUsd?: number;
  formattedAmountUsd?: string;
  startTime?: number;
  endTime?: number;
  updatedAt: number;
  warning?: string;
}

interface CostsAmount {
  value?: unknown;
  currency?: unknown;
}

interface CostsResult {
  amount?: CostsAmount;
}

interface CostsBucket {
  start_time?: unknown;
  end_time?: unknown;
  results?: unknown;
  result?: unknown;
}

interface CostsResponse {
  data?: unknown;
}

interface OpenAIDailySpendRefreshOptions {
  setOpenAIDailySpend: (snapshot: OpenAIDailySpend) => void;
  redraw: () => void;
  fetchCosts?: typeof fetchOpenAITodayCosts;
  now?: () => Date;
}

const OPENAI_COSTS_URL = 'https://api.openai.com/v1/organization/costs';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedSnapshot: OpenAIDailySpend | null = null;
let inFlight: Promise<void> | null = null;

export function resetOpenAIDailySpendCache(): void {
  cachedSnapshot = null;
  inFlight = null;
}

function startOfUtcDay(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
}

function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function getAdminApiKey(): string | null {
  return process.env.OPENAI_ADMIN_KEY || null;
}

function getResults(bucket: CostsBucket): CostsResult[] {
  const rawResults = bucket.results ?? bucket.result;
  if (!Array.isArray(rawResults)) return [];
  return rawResults.filter((item): item is CostsResult => typeof item === 'object' && item !== null);
}

function parseTodayCosts(json: CostsResponse): { amountUsd: number; startTime?: number; endTime?: number } {
  const buckets = Array.isArray(json.data)
    ? json.data.filter((item): item is CostsBucket => typeof item === 'object' && item !== null)
    : [];
  let amountUsd = 0;
  let startTime: number | undefined;
  let endTime: number | undefined;

  for (const bucket of buckets) {
    if (typeof bucket.start_time === 'number') startTime = startTime === undefined ? bucket.start_time : Math.min(startTime, bucket.start_time);
    if (typeof bucket.end_time === 'number') endTime = endTime === undefined ? bucket.end_time : Math.max(endTime, bucket.end_time);
    for (const result of getResults(bucket)) {
      const amount = result.amount;
      if (amount?.currency !== 'usd' || typeof amount.value !== 'number') continue;
      amountUsd += amount.value;
    }
  }

  return { amountUsd, startTime, endTime };
}

export async function fetchOpenAITodayCosts(now = new Date()): Promise<OpenAIDailySpend> {
  const apiKey = getAdminApiKey();
  if (!apiKey) {
    return { state: 'idle', updatedAt: Date.now(), warning: 'OPENAI_ADMIN_KEY missing' };
  }

  const startTime = startOfUtcDay(now);
  const url = new URL(OPENAI_COSTS_URL);
  url.searchParams.set('start_time', startTime.toString());
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const suffix = body ? `: ${body.slice(0, 160)}` : '';
    throw new Error(`OpenAI costs HTTP ${response.status}${suffix}`);
  }

  const parsed = parseTodayCosts(await response.json() as CostsResponse);
  return {
    state: 'ready',
    amountUsd: parsed.amountUsd,
    formattedAmountUsd: formatUsd(parsed.amountUsd),
    startTime: parsed.startTime ?? startTime,
    endTime: parsed.endTime,
    updatedAt: Date.now(),
  };
}

export function refreshOpenAIDailySpend(options: OpenAIDailySpendRefreshOptions): void {
  const now = options.now?.() ?? new Date();
  if (cachedSnapshot && Date.now() - cachedSnapshot.updatedAt < CACHE_TTL_MS) {
    options.setOpenAIDailySpend(cachedSnapshot);
    options.redraw();
    return;
  }
  if (inFlight) return;

  options.setOpenAIDailySpend({ state: 'pending', updatedAt: Date.now() });
  options.redraw();

  inFlight = (async () => {
    try {
      cachedSnapshot = await (options.fetchCosts ?? fetchOpenAITodayCosts)(now);
      options.setOpenAIDailySpend(cachedSnapshot);
    } catch (error) {
      cachedSnapshot = {
        state: 'unavailable',
        updatedAt: Date.now(),
        warning: error instanceof Error ? error.message : String(error),
      };
      options.setOpenAIDailySpend(cachedSnapshot);
    } finally {
      inFlight = null;
      options.redraw();
    }
  })();
}
