import { createAnthropic } from '@ai-sdk/anthropic';
import type { ProviderConfig } from '../types.js';
import { resolveApiKey } from '../../config/index.js';
import {
  parseAnthropicRateLimitHeaders,
  parseAnthropicExtendedHeaders,
  extractAnthropicRateLimitBuckets,
  groqHeadersToSnapshot,
  type RateLimitSnapshot,
} from '../quota/headers.js';
import { log } from '../../logger.js';
import type { AnthropicTokenUsage } from '../anthropic-cost.js';
import { saveObservedRateLimits } from '../model-store.js';
import { HeaderSnapshotStore, UsageCaptureStore } from './adapter-usage-capture.js';

const headerStore = new HeaderSnapshotStore();
const usageStore = new UsageCaptureStore<AnthropicTokenUsage>();

export function getLastCapturedAnthropicHeaders(providerId: string): RateLimitSnapshot | null {
  return headerStore.get(providerId);
}

type AnthropicSseEvent = {
  event: string;
  data: unknown;
};

type AnthropicUsagePayload = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  server_tool_use?: Record<string, number>;
};

function parseJsonSseEvents(body: string): AnthropicSseEvent[] {
  const events: AnthropicSseEvent[] = [];
  for (const block of body.split(/\r?\n\r?\n+/)) {
    const lines = block.split(/\r?\n/);
    const eventLine = lines.find((line) => line.startsWith('event: '));
    const dataLines = lines
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length));

    if (!eventLine || dataLines.length === 0) continue;

    const dataText = dataLines.join('\n').trim();
    try {
      events.push({
        event: eventLine.slice('event: '.length).trim(),
        data: JSON.parse(dataText),
      });
    } catch {
      // Ignore malformed SSE data for cost reporting; the caller will mark usage unavailable.
    }
  }
  return events;
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function addServerToolUse(target: Record<string, number>, source: unknown): void {
  if (!source || typeof source !== 'object') return;
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + numberOrZero(value);
  }
}

function addUsage(target: AnthropicTokenUsage, usage: AnthropicUsagePayload | undefined): void {
  if (!usage) return;
  target.hasRawUsage = true;
  target.inputTokens += numberOrZero(usage.input_tokens);
  target.outputTokens += numberOrZero(usage.output_tokens);
  target.cacheCreationInputTokens += numberOrZero(usage.cache_creation_input_tokens);
  target.cacheReadInputTokens += numberOrZero(usage.cache_read_input_tokens);
  target.cacheCreation5mInputTokens += numberOrZero(usage.cache_creation?.ephemeral_5m_input_tokens);
  target.cacheCreation1hInputTokens += numberOrZero(usage.cache_creation?.ephemeral_1h_input_tokens);
  addServerToolUse(target.serverToolUse ??= {}, usage.server_tool_use);
}

export function parseAnthropicUsageFromSse(body: string, inferenceGeo?: string): AnthropicTokenUsage | null {
  const usage: AnthropicTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheReadInputTokens: 0,
    serverToolUse: {},
    hasRawUsage: false,
    inferenceGeo,
  };

  for (const event of parseJsonSseEvents(body)) {
    if (event.event === 'message_start') {
      const data = event.data as { message?: { usage?: AnthropicUsagePayload } };
      addUsage(usage, data.message?.usage);
    } else if (event.event === 'message_delta') {
      const data = event.data as { usage?: AnthropicUsagePayload };
      addUsage(usage, data.usage);
    }
  }

  return usage.hasRawUsage ? usage : null;
}

export function beginAnthropicUsageCapture(providerId: string): void {
  usageStore.begin(providerId);
}

export async function endAnthropicUsageCapture(providerId: string): Promise<AnthropicTokenUsage | null> {
  return mergeAnthropicUsages(await usageStore.end(providerId));
}

export function mergeAnthropicUsages(usages: AnthropicTokenUsage[]): AnthropicTokenUsage | null {
  if (usages.length === 0) return null;

  return usages.reduce<AnthropicTokenUsage>((total, usage) => {
    total.inputTokens += usage.inputTokens;
    total.outputTokens += usage.outputTokens;
    total.cacheCreationInputTokens += usage.cacheCreationInputTokens;
    total.cacheCreation5mInputTokens += usage.cacheCreation5mInputTokens;
    total.cacheCreation1hInputTokens += usage.cacheCreation1hInputTokens;
    total.cacheReadInputTokens += usage.cacheReadInputTokens;
    total.hasRawUsage ||= usage.hasRawUsage;
    total.inferenceGeo ??= usage.inferenceGeo;
    addServerToolUse(total.serverToolUse ??= {}, usage.serverToolUse);
    return total;
  }, {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheReadInputTokens: 0,
    serverToolUse: {},
    hasRawUsage: false,
  });
}

function extractAnthropicModelFromBody(body: RequestInit['body']): string | null {
  if (typeof body !== 'string') return null;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    return typeof parsed['model'] === 'string' ? parsed['model'] : null;
  } catch { return null; }
}

function getInferenceGeo(init: RequestInit | undefined): string | undefined {
  if (typeof init?.body !== 'string') return undefined;
  try {
    const body = JSON.parse(init.body) as { inference_geo?: unknown };
    return typeof body.inference_geo === 'string' ? body.inference_geo : undefined;
  } catch {
    return undefined;
  }
}

function captureAnthropicUsage(providerId: string, response: Response, inferenceGeo?: string): void {
  usageStore.push(providerId, response.clone().text()
    .then((body) => parseAnthropicUsageFromSse(body, inferenceGeo)));
}

export function createAnthropicProvider(providerConfig: ProviderConfig) {
  const apiKey = resolveApiKey(providerConfig);
  if (!apiKey) throw new Error(`No API key for ${providerConfig.id}`);

  const debugQuota = process.env['DEBUG_QUOTA'] !== '0';

  const customFetch: typeof globalThis.fetch = async (input, init) => {
    // Session ingress tokens (sk-ant-si-*) are JWTs and must be sent as Bearer,
    // not x-api-key. Swap the header when we detect that format.
    let fetchInit = init;
    if (apiKey.startsWith('sk-ant-si-')) {
      const headers = new Headers(init?.headers);
      headers.delete('x-api-key');
      headers.set('Authorization', `Bearer ${apiKey}`);
      fetchInit = { ...init, headers };
    }
    const response = await globalThis.fetch(input, fetchInit);
    captureAnthropicUsage(providerConfig.id, response, getInferenceGeo(fetchInit));
    const base = parseAnthropicRateLimitHeaders(response.headers);
    const extended = parseAnthropicExtendedHeaders(response.headers);
    if (debugQuota) {
      headerStore.set(providerConfig.id, groqHeadersToSnapshot(base));
      log('quota', `Anthropic rate-limit headers`, { base, extended });
    }
    // Persist limit ceilings to models.json if we received rate-limit headers.
    const buckets = extractAnthropicRateLimitBuckets(base, extended);
    if (Object.keys(buckets).length > 0) {
      const modelId = extractAnthropicModelFromBody(fetchInit?.body);
      if (modelId) saveObservedRateLimits(providerConfig.id, modelId, buckets);
    }
    return response;
  };

  return createAnthropic({ apiKey, fetch: customFetch });
}
