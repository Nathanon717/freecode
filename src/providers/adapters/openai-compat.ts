import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderConfig } from '../types.js';
import { loadConfig } from '../../config/index.js';
import { parseGroqRateLimitHeaders, type GroqRateLimitHeaders } from '../quota/headers.js';

// Module-level store: most-recently captured rate-limit headers per provider ID.
// Written by the custom fetch wrapper; read by the agent loop for logging.
const lastCapturedHeaders = new Map<string, GroqRateLimitHeaders>();

/**
 * Return the headers captured from the most recent HTTP response for the given
 * provider, or null if none have been captured yet.
 */
export function getLastCapturedHeaders(providerId: string): GroqRateLimitHeaders | null {
  return lastCapturedHeaders.get(providerId) ?? null;
}

export function createOpenAICompatProvider(providerConfig: ProviderConfig) {
  const config = loadConfig();
  const apiKey =
    process.env[providerConfig.apiKeyEnvVar] ||
    config.providers[providerConfig.id]?.apiKey ||
    'placeholder';

  // Capture Groq rate-limit headers unless explicitly disabled (DEBUG_QUOTA=0).
  // Defaults to ON so Phase-1 observation works out of the box.
  const debugQuota = process.env['DEBUG_QUOTA'] !== '0';
  const shouldCapture = debugQuota && providerConfig.id === 'groq';

  // o1/o3 reasoning models reject the temperature parameter entirely.
  const isReasoningModel = (modelId: string) => /^(o1|o3)(-|$)/i.test(modelId);
  const shouldStripTemperature = providerConfig.id === 'openai';

  const customFetch: typeof globalThis.fetch | undefined = (shouldCapture || shouldStripTemperature)
    ? async (input, init) => {
        if (shouldCapture && process.env['DEBUG_TOOLS'] === '1' && init?.body) {
          try {
            const body = JSON.parse(init.body as string);
            process.stderr.write(`[groq-req] tools: ${JSON.stringify(body.tools?.map((t: { function?: { name: string; parameters: unknown } }) => ({ name: t.function?.name, schema: t.function?.parameters })), null, 2)}\n`);
          } catch { /* ignore */ }
        }

        let patchedInit = init;
        if (shouldStripTemperature && init?.body) {
          try {
            const body = JSON.parse(init.body as string);
            if (isReasoningModel(body.model ?? '') && 'temperature' in body) {
              const { temperature: _t, ...rest } = body;
              patchedInit = { ...init, body: JSON.stringify(rest) };
            }
          } catch { /* ignore — leave body untouched */ }
        }

        const response = await globalThis.fetch(input, patchedInit);
        if (shouldCapture) {
          lastCapturedHeaders.set(
            providerConfig.id,
            parseGroqRateLimitHeaders(response.headers)
          );
        }
        return response;
      }
    : undefined;

  return createOpenAI({
    baseURL: providerConfig.baseUrl,
    apiKey,
    ...(customFetch ? { fetch: customFetch } : {}),
  });
}

export function createOllamaProvider() {
  return createOpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });
}
