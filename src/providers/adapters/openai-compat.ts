import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '../types.js';
import { loadConfig, resolveApiKey } from '../../config/index.js';
import { isRecord } from '../../util/guards.js';
import {
  parseGroqRateLimitHeaders,
  groqHeadersToSnapshot,
  parseMistralRateLimitSnapshot,
  parseCerebrasRateLimitSnapshot,
  type RateLimitSnapshot,
} from '../quota/headers.js';

export interface CapturedProviderUsage {
  providerId: string;
  responseId?: string;
  model?: string;
  usage: unknown;
  source: 'json' | 'sse';
  capturedAt: number;
}

// Module-level store: most-recently captured rate-limit headers per provider ID.
// Written by the custom fetch wrapper; read by the agent loop for logging.
const lastCapturedHeaders = new Map<string, RateLimitSnapshot>();
const usageCapturePromises = new Map<string, Promise<CapturedProviderUsage | null>[]>();

// Set before a streamText call to inject parallel_tool_calls:false for that provider.
const parallelToolsDisabled = new Set<string>();

export function setParallelToolsDisabled(providerId: string, disabled: boolean): void {
  if (disabled) parallelToolsDisabled.add(providerId);
  else parallelToolsDisabled.delete(providerId);
}

export async function formatOpenAICompatHttpError(providerName: string, response: Response): Promise<string | null> {
  if (response.ok) return null;

  const body = await response.clone().text().catch(() => '');
  let providerMessage: string | undefined;
  let providerCode: string | number | undefined;

  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (isRecord(parsed) && isRecord(parsed.error)) {
        providerMessage = typeof parsed.error.message === 'string' ? parsed.error.message : undefined;
        providerCode = typeof parsed.error.code === 'string' || typeof parsed.error.code === 'number'
          ? parsed.error.code
          : undefined;
      }
    } catch {
      providerMessage = body.slice(0, 500);
    }
  }

  const status = `${response.status} ${response.statusText}`.trim();
  const retryAfter = formatRetryAfter(response.headers.get('retry-after'));
  const retryHint = response.status === 429 && retryAfter
    ? ` Retry after ${retryAfter}.`
    : '';
  const providerHint = response.status === 429 && providerName === 'OpenRouter'
    ? ' OpenRouter rate limits can come from OpenRouter or the upstream model provider; try again later or switch models/providers.'
    : '';
  const details = providerMessage
    ? `${providerMessage}${providerCode !== undefined ? ` (code: ${providerCode})` : ''}`
    : body.slice(0, 500);
  return details
    ? `${providerName} HTTP ${status}: ${details}${retryHint}${providerHint}`
    : `${providerName} HTTP ${status}${retryHint}${providerHint}`;
}

/**
 * Return the headers captured from the most recent HTTP response for the given
 * provider, or null if none have been captured yet.
 */
export function getLastCapturedHeaders(providerId: string): RateLimitSnapshot | null {
  return lastCapturedHeaders.get(providerId) ?? null;
}

export function beginProviderUsageCapture(providerId: string): void {
  usageCapturePromises.set(providerId, []);
}

export async function endProviderUsageCapture(providerId: string): Promise<CapturedProviderUsage[]> {
  const promises = usageCapturePromises.get(providerId) ?? [];
  usageCapturePromises.delete(providerId);
  const results = await Promise.all(promises);
  return results.filter((usage): usage is CapturedProviderUsage => usage !== null);
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

function parseRetryAfterMs(value: string | null): number {
  if (!value) return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds) * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(1000, date - Date.now());
  return 1000;
}

function formatRetryAfter(value: string | null): string | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    if (seconds === 1) return '1 second';
    return `${Math.ceil(seconds)} seconds`;
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    const secondsUntil = Math.max(0, Math.ceil((date - Date.now()) / 1000));
    if (secondsUntil === 1) return '1 second';
    return `${secondsUntil} seconds`;
  }

  return value;
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

function normalizeOpenAICompatToolCallDelta(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const choices = value['choices'];
  if (!Array.isArray(choices)) return value;

  let changed = false;
  const nextChoices = choices.map(choice => {
    if (!isRecord(choice)) return choice;
    const delta = choice['delta'];
    if (!isRecord(delta)) return choice;
    const toolCalls = delta['tool_calls'];
    if (!Array.isArray(toolCalls)) return choice;

    const nextToolCalls = toolCalls.map(toolCall => {
      if (!isRecord(toolCall)) return toolCall;
      if (toolCall['type'] === 'function') return toolCall;
      if (!isRecord(toolCall['function'])) return toolCall;
      changed = true;
      return { ...toolCall, type: 'function' };
    });

    return {
      ...choice,
      delta: {
        ...delta,
        tool_calls: nextToolCalls,
      },
    };
  });

  return changed ? { ...value, choices: nextChoices } : value;
}

export function normalizeOpenAICompatToolCallSse(body: string): string {
  return body.split(/(\r?\n)/).map(part => {
    if (!part.startsWith('data:')) return part;
    const data = part.slice('data:'.length).trim();
    if (!data || data === '[DONE]') return part;

    try {
      const normalized = normalizeOpenAICompatToolCallDelta(JSON.parse(data) as unknown);
      return `data: ${JSON.stringify(normalized)}`;
    } catch {
      return part;
    }
  }).join('');
}

/**
 * Convert a non-streaming OpenAI-compatible JSON response into SSE format.
 *
 * Mistral only returns x-ratelimit-* headers on non-streaming responses. We
 * strip stream:true from the request so we get those headers, then synthesize
 * SSE here so the rest of the pipeline (AI SDK, normalizer, usage capture) is
 * unchanged.
 */
export function mistralJsonToSse(json: unknown): string {
  if (!isRecord(json)) return 'data: [DONE]\n\n';

  const id = typeof json.id === 'string' ? json.id : '';
  const model = typeof json.model === 'string' ? json.model : '';
  const created = typeof json.created === 'number' ? json.created : 0;
  const usage = isRecord(json.usage) ? json.usage : null;
  const choices = Array.isArray(json.choices) ? json.choices : [];

  const parts: string[] = [];
  const emit = (obj: Record<string, unknown>) => {
    parts.push(`data: ${JSON.stringify(obj)}\n\n`);
  };
  const chunk = (chunkChoices: unknown[], extra?: Record<string, unknown>) => {
    emit({ id, object: 'chat.completion.chunk', created, model, choices: chunkChoices, ...extra });
  };

  for (const choice of choices) {
    if (!isRecord(choice)) continue;
    const message = isRecord(choice.message) ? choice.message : {};
    const finishReason = typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
    const idx = typeof choice.index === 'number' ? choice.index : 0;
    const content = typeof message.content === 'string' ? message.content : null;
    const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : null;

    if (rawToolCalls && rawToolCalls.length > 0) {
      const deltaToolCalls = rawToolCalls.map((tc, i) => {
        if (!isRecord(tc)) return tc;
        const fn = isRecord(tc.function) ? tc.function : {};
        return {
          index: typeof tc.index === 'number' ? tc.index : i,
          id: typeof tc.id === 'string' ? tc.id : '',
          type: 'function',
          function: {
            name: typeof fn.name === 'string' ? fn.name : '',
            arguments: typeof fn.arguments === 'string' ? fn.arguments : '',
          },
        };
      });
      chunk([{ index: idx, delta: { role: 'assistant', content: content ?? null, tool_calls: deltaToolCalls }, finish_reason: null }]);
      chunk([{ index: idx, delta: {}, finish_reason: finishReason ?? 'tool_calls' }]);
    } else {
      chunk([{ index: idx, delta: { role: 'assistant', content: content ?? '' }, finish_reason: null }]);
      chunk([{ index: idx, delta: {}, finish_reason: finishReason ?? 'stop' }]);
    }
  }

  if (usage) chunk([], { usage });
  parts.push('data: [DONE]\n\n');
  return parts.join('');
}

async function normalizeOpenAICompatToolCallResponse(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('text/event-stream')) return response;

  const body = await response.clone().text();
  const normalized = normalizeOpenAICompatToolCallSse(body);
  if (normalized === body) return response;

  return new Response(normalized, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
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
  const captures = usageCapturePromises.get(providerId);
  if (!captures) return;
  captures.push(parseProviderUsage(providerId, response).catch(() => null));
}

export function getOpenAICompatProviderHeaders(providerId: string): Record<string, string> | undefined {
  if (providerId !== 'openrouter') return undefined;
  return {
    'HTTP-Referer': 'https://freecode.local',
    'X-Title': 'freecode',
  };
}

export function openAIModelDisallowsTemperature(modelId: string): boolean {
  return /^(o1|o3|gpt-5)([-.]|$)/i.test(modelId);
}

export function createOpenAICompatProvider(providerConfig: ProviderConfig) {
  const apiKey = resolveApiKey(providerConfig) ?? 'placeholder';

  // Capture Groq rate-limit headers unless explicitly disabled (DEBUG_QUOTA=0).
  // Defaults to ON so Phase-1 observation works out of the box.
  const debugQuota = process.env['DEBUG_QUOTA'] !== '0';
  const shouldCapture = debugQuota && ['groq', 'mistral', 'cerebras'].includes(providerConfig.id);
  const shouldCaptureUsage = true;

  // Some OpenAI reasoning models only accept the default temperature. The AI SDK
  // may send temperature: 0, so remove it and let OpenAI apply the default.
  const shouldStripTemperature = providerConfig.id === 'openai';

  const customFetch: typeof globalThis.fetch | undefined = (shouldCapture || shouldStripTemperature || shouldCaptureUsage)
    ? async (input, init) => {
        if (shouldCapture && process.env['DEBUG_TOOLS'] === '1' && init?.body) {
          try {
            const body = JSON.parse(init.body as string);
            process.stderr.write(`[groq-req] tools: ${JSON.stringify(body.tools?.map((t: { function?: { name: string; parameters: unknown } }) => ({ name: t.function?.name, schema: t.function?.parameters })), null, 2)}\n`);
          } catch { /* ignore */ }
        }

        let patchedInit = init;
        let mistralForcedNonStream = false;
        if (providerConfig.id === 'mistral' && patchedInit?.body) {
          try {
            const body = JSON.parse(patchedInit.body as string);
            if (body.stream) {
              const { stream: _s, stream_options: _so, ...rest } = body;
              patchedInit = { ...patchedInit, body: JSON.stringify(rest) };
              mistralForcedNonStream = true;
            }
          } catch { /* leave body untouched */ }
        }
        if (shouldStripTemperature && init?.body) {
          try {
            const body = JSON.parse(init.body as string);
            if (openAIModelDisallowsTemperature(body.model ?? '') && 'temperature' in body) {
              const { temperature: _t, ...rest } = body;
              patchedInit = { ...init, body: JSON.stringify(rest) };
            }
          } catch { /* ignore — leave body untouched */ }
        }

        if (parallelToolsDisabled.has(providerConfig.id) && patchedInit?.body) {
          try {
            const body = JSON.parse(patchedInit.body as string);
            if (Array.isArray(body.tools) && body.tools.length > 0) {
              patchedInit = { ...patchedInit, body: JSON.stringify({ ...body, parallel_tool_calls: false }) };
            }
          } catch { /* ignore — leave body untouched */ }
        }

        let response = await globalThis.fetch(input, patchedInit);
        const maxWaitMs = loadConfig().retryMaxWaitSeconds * 1000;
        for (let attempt = 0; response.status === 429 && attempt < 5; attempt++) {
          const retryHeader = response.headers.get('retry-after');
          if (!retryHeader) break;
          const delayMs = parseRetryAfterMs(retryHeader);
          if (delayMs > maxWaitMs) break;
          await new Promise<void>(resolve => {
            let remaining = Math.ceil(delayMs / 1000);
            const name = providerConfig.name;
            process.stdout.write(`\n${name} rate-limited — retrying in ${remaining}s...`);
            const tick = setInterval(() => {
              remaining -= 1;
              if (remaining <= 0) {
                clearInterval(tick);
                process.stdout.write(`\r\x1b[2K${name} rate-limited — retrying now...\n`);
                resolve();
              } else {
                process.stdout.write(`\r${name} rate-limited — retrying in ${remaining}s...`);
              }
            }, 1000);
          });
          response = await globalThis.fetch(input, patchedInit);
        }
        if (shouldCapture) {
          let snapshot: RateLimitSnapshot;
          if (providerConfig.id === 'mistral') {
            snapshot = parseMistralRateLimitSnapshot(response.headers);
          } else if (providerConfig.id === 'cerebras') {
            snapshot = parseCerebrasRateLimitSnapshot(response.headers);
          } else {
            snapshot = groqHeadersToSnapshot(parseGroqRateLimitHeaders(response.headers));
          }
          if (snapshot.length > 0) lastCapturedHeaders.set(providerConfig.id, snapshot);
        }
        const httpError = await formatOpenAICompatHttpError(providerConfig.name, response);
        if (httpError) {
          throw new Error(httpError);
        }
        if (mistralForcedNonStream && response.ok) {
          const jsonBody = await response.json().catch(() => null);
          const sseText = mistralJsonToSse(jsonBody);
          const sseHeaders = new Headers(response.headers);
          sseHeaders.set('content-type', 'text/event-stream; charset=utf-8');
          response = new Response(sseText, { status: 200, statusText: 'OK', headers: sseHeaders });
        }
        response = await normalizeOpenAICompatToolCallResponse(response);
        if (shouldCaptureUsage) {
          captureProviderUsage(providerConfig.id, response);
        }
        return response;
      }
    : undefined;

  return createOpenAI({
    baseURL: providerConfig.baseUrl,
    apiKey,
    headers: getOpenAICompatProviderHeaders(providerConfig.id),
    ...(customFetch ? { fetch: customFetch } : {}),
  });
}

export function createOllamaProvider() {
  return createOpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });
}
