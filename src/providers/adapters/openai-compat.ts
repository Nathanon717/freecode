import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '../types.js';
import { loadConfig, resolveApiKey } from '../../config/index.js';
import { isRecord } from '../../util/guards.js';
import { extractOpenAICompatRateLimitBuckets, type RateLimitSnapshot } from '../quota/headers.js';
import { saveObservedRateLimits } from '../model-store.js';
import { mistralJsonToSse, normalizeOpenAICompatToolCallResponse } from './openai-compat-sse.js';
import { HeaderSnapshotStore, UsageCaptureStore } from './adapter-usage-capture.js';
import { fetchWithRetry, formatOpenAICompatHttpError } from './adapter-http-retry.js';
import { providerQuirks } from './openai-compat-quirks.js';
import { injectParallelToolCallsFalse } from './openai-compat-request.js';

type QuotaUpdateSink = (snapshot: RateLimitSnapshot) => void;
let quotaUpdateSink: QuotaUpdateSink | null = null;
export function registerQuotaUpdateSink(fn: QuotaUpdateSink | null): void {
  quotaUpdateSink = fn;
}

export interface CapturedProviderUsage {
  providerId: string;
  responseId?: string;
  model?: string;
  usage: unknown;
  source: 'json' | 'sse';
  capturedAt: number;
}

// Most-recently captured rate-limit headers per provider ID. Written by the
// custom fetch wrapper; read by the agent loop for logging.
const headerStore = new HeaderSnapshotStore();
const usageStore = new UsageCaptureStore<CapturedProviderUsage>();

// Set before a streamText call to inject parallel_tool_calls:false for that provider.
const parallelToolsDisabled = new Set<string>();

export function setParallelToolsDisabled(providerId: string, disabled: boolean): void {
  if (disabled) parallelToolsDisabled.add(providerId);
  else parallelToolsDisabled.delete(providerId);
}

/**
 * Return the headers captured from the most recent HTTP response for the given
 * provider, or null if none have been captured yet.
 */
export function getLastCapturedHeaders(providerId: string): RateLimitSnapshot | null {
  return headerStore.get(providerId);
}

export function beginProviderUsageCapture(providerId: string): void {
  usageStore.begin(providerId);
}

export async function endProviderUsageCapture(providerId: string): Promise<CapturedProviderUsage[]> {
  return usageStore.end(providerId);
}

export function formatCapturedProviderUsages(usages: CapturedProviderUsage[] | null | undefined): string | null {
  if (!usages || usages.length === 0) return null;
  const payload = usages.map(({ providerId, responseId, model, source, usage }) => ({
    providerId,
    ...(model ? { model } : {}),
    ...(responseId ? { responseId } : {}),
    source,
    usage,
  }));
  return JSON.stringify(usages.length === 1 ? payload[0] : payload, null, 2);
}

/** Return the static extra headers for a provider (e.g. OpenRouter HTTP-Referer). */
export function getOpenAICompatProviderHeaders(providerId: string): Record<string, string> | undefined {
  return providerQuirks[providerId]?.staticHeaders;
}

function usageFromPayload(providerId: string, payload: unknown, source: 'json' | 'sse'): CapturedProviderUsage | null {
  if (!isRecord(payload)) return null;
  const usage = isRecord(payload.usage) ? payload.usage : null;
  const response = isRecord(payload.response) ? payload.response : null;
  const responseUsage = isRecord(response?.usage) ? response.usage : null;
  const capturedUsage = usage ?? responseUsage;
  if (!capturedUsage) return null;

  const responseId = typeof payload.id === 'string'
    ? payload.id
    : typeof response?.id === 'string'
      ? response.id
      : undefined;
  const model = typeof payload.model === 'string'
    ? payload.model
    : typeof response?.model === 'string'
      ? response.model
      : undefined;

  return {
    providerId,
    responseId,
    model,
    usage: capturedUsage,
    source,
    capturedAt: Date.now(),
  };
}

function parseProviderUsageFromSse(providerId: string, body: string): CapturedProviderUsage | null {
  let lastUsage: CapturedProviderUsage | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice('data:'.length).trim();
    if (!data || data === '[DONE]') continue;
    try {
      lastUsage = usageFromPayload(providerId, JSON.parse(data), 'sse') ?? lastUsage;
    } catch {
      // Ignore non-JSON SSE comments or malformed provider chunks.
    }
  }
  return lastUsage;
}

async function parseProviderUsage(providerId: string, response: Response): Promise<CapturedProviderUsage | null> {
  const body = await response.clone().text();
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    return parseProviderUsageFromSse(providerId, body);
  }

  try {
    return usageFromPayload(providerId, JSON.parse(body), 'json');
  } catch {
    return null;
  }
}

function captureProviderUsage(providerId: string, response: Response): void {
  usageStore.push(providerId, parseProviderUsage(providerId, response));
}

function saveLimitsFromHeaders(providerId: string, headers: Headers, body: RequestInit['body']): void {
  let modelId: string | undefined;
  try { modelId = typeof body === 'string' ? (JSON.parse(body) as Record<string, unknown>)['model'] as string : undefined; } catch { /* ignore */ }
  if (!modelId) return;
  saveObservedRateLimits(providerId, modelId, extractOpenAICompatRateLimitBuckets(providerId, headers));
}

export function createOpenAICompatProvider(providerConfig: ProviderConfig) {
  const apiKey = resolveApiKey(providerConfig) ?? 'placeholder';
  const profile = providerQuirks[providerConfig.id];
  const debugQuota = process.env['DEBUG_QUOTA'] !== '0';
  const shouldCapture = debugQuota && (profile?.captureRateLimits ?? false);

  const customFetch: typeof globalThis.fetch = async (input, init) => {
    let patchedInit = init;
    let forcedNonStream = false;

    if (patchedInit?.body) {
      try {
        let body = JSON.parse(patchedInit.body as string) as Record<string, unknown>;

        if (shouldCapture && process.env['DEBUG_TOOLS'] === '1') {
          const tools = Array.isArray(body['tools']) ? body['tools'] as { function?: { name: string; parameters: unknown } }[] : [];
          process.stderr.write(`[groq-req] tools: ${JSON.stringify(tools.map(t => ({ name: t.function?.name, schema: t.function?.parameters })), null, 2)}\n`);
        }

        if (profile?.transformRequest) {
          const result = profile.transformRequest(body);
          body = result.body;
          forcedNonStream = result.forcedNonStream ?? false;
        }

        if (parallelToolsDisabled.has(providerConfig.id)) {
          body = injectParallelToolCallsFalse(body);
        }

        patchedInit = { ...patchedInit, body: JSON.stringify(body) };
      } catch { /* leave body untouched */ }
    }

    let response = await fetchWithRetry(input, patchedInit, {
      providerName: providerConfig.name,
      maxWaitMs: loadConfig().retryMaxWaitSeconds * 1000,
      onRetryableResponse: shouldCapture
        ? (headers) => {
            if (!quotaUpdateSink) return;
            const snap = profile.parseRateLimitSnapshot?.(headers) ?? [];
            if (snap.length > 0) {
              headerStore.set(providerConfig.id, snap);
              quotaUpdateSink(snap);
            }
          }
        : undefined,
    });

    if (shouldCapture) {
      const snapshot = profile.parseRateLimitSnapshot?.(response.headers) ?? [];
      if (snapshot.length > 0) {
        headerStore.set(providerConfig.id, snapshot);
        saveLimitsFromHeaders(providerConfig.id, response.headers, patchedInit?.body);
      }
    }

    const httpError = await formatOpenAICompatHttpError(providerConfig.name, response, profile?.httpErrorHint);
    if (httpError) {
      throw Object.assign(new Error(httpError), { statusCode: response.status });
    }

    if (forcedNonStream && response.ok) {
      const jsonBody = await response.json().catch(() => null);
      const sseText = mistralJsonToSse(jsonBody);
      const sseHeaders = new Headers(response.headers);
      sseHeaders.set('content-type', 'text/event-stream; charset=utf-8');
      response = new Response(sseText, { status: 200, statusText: 'OK', headers: sseHeaders });
    }

    response = normalizeOpenAICompatToolCallResponse(response);
    captureProviderUsage(providerConfig.id, response);
    return response;
  };

  return createOpenAI({
    baseURL: providerConfig.baseUrl,
    apiKey,
    headers: profile?.staticHeaders,
    fetch: customFetch,
  });
}

export function createOllamaProvider() {
  return createOpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });
}
