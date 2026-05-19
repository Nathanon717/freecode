import { createAnthropic } from '@ai-sdk/anthropic';
import type { ProviderConfig } from '../types.js';
import { loadConfig } from '../../config/index.js';
import {
  parseAnthropicRateLimitHeaders,
  parseAnthropicExtendedHeaders,
  type GroqRateLimitHeaders,
} from '../quota/headers.js';
import { log } from '../../logger.js';

const lastCapturedHeaders = new Map<string, GroqRateLimitHeaders>();

export function getLastCapturedAnthropicHeaders(providerId: string): GroqRateLimitHeaders | null {
  return lastCapturedHeaders.get(providerId) ?? null;
}

export function createAnthropicProvider(providerConfig: ProviderConfig) {
  const config = loadConfig();
  const apiKey =
    process.env[providerConfig.apiKeyEnvVar] ||
    config.providers[providerConfig.id]?.apiKey;

  if (!apiKey) throw new Error(`No API key for ${providerConfig.id}`);

  const debugQuota = process.env['DEBUG_QUOTA'] !== '0';

  const customFetch: typeof globalThis.fetch = async (input, init) => {
    // Session ingress tokens (sk-ant-si-*) are JWTs and must be sent as Bearer,
    // not x-api-key. Swap the header when we detect that format.
    let fetchInit = init;
    if (apiKey.startsWith('sk-ant-si-')) {
      const headers = new Headers(init?.headers as Record<string, string> | undefined);
      headers.delete('x-api-key');
      headers.set('Authorization', `Bearer ${apiKey}`);
      fetchInit = { ...init, headers };
    }
    const response = await globalThis.fetch(input, fetchInit);
    if (debugQuota) {
      const base = parseAnthropicRateLimitHeaders(response.headers);
      lastCapturedHeaders.set(providerConfig.id, base);
      const extended = parseAnthropicExtendedHeaders(response.headers);
      log('quota', `Anthropic rate-limit headers`, { base, extended });
    }
    return response;
  };

  return createAnthropic({ apiKey, fetch: customFetch });
}
