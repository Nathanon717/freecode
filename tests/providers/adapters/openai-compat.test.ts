import { describe, it, expect, afterEach } from 'vitest';
import {
  getOpenAICompatProviderHeaders,
  formatCapturedProviderUsages,
  registerQuotaUpdateSink,
  setParallelToolsDisabled,
  getLastCapturedHeaders,
  beginProviderUsageCapture,
  endProviderUsageCapture,
  type CapturedProviderUsage,
} from '../../../src/providers/adapters/openai-compat.js';
import { formatOpenAICompatHttpError } from '../../../src/providers/adapters/adapter-http-retry.js';
import { providerQuirks } from '../../../src/providers/adapters/openai-compat-quirks.js';

describe('Router Logic', () => {
  describe('provider API format detection', () => {
    function getApiFormat(providerId: string): 'openai' | 'cohere' {
      if (providerId === 'cohere') return 'cohere';
      return 'openai';
    }

    it('should detect Cohere format', () => {
      expect(getApiFormat('cohere')).toBe('cohere');
    });

    it('should default to OpenAI format', () => {
      expect(getApiFormat('groq')).toBe('openai');
      expect(getApiFormat('openrouter')).toBe('openai');
      expect(getApiFormat('ollama')).toBe('openai');
    });
  });

  describe('OpenRouter headers', () => {
    it('should include required headers', () => {
      const headers = getOpenAICompatProviderHeaders('openrouter');
      expect(headers?.['HTTP-Referer']).toBe('https://freecode.local');
      expect(headers?.['X-Title']).toBe('freecode');
    });

    it('should not add OpenRouter headers to other providers', () => {
      expect(getOpenAICompatProviderHeaders('groq')).toBeUndefined();
    });
  });

  describe('formatCapturedProviderUsages', () => {
    const base: CapturedProviderUsage = {
      providerId: 'groq',
      source: 'json',
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      capturedAt: 0,
    };

    it('returns null for null input', () => {
      expect(formatCapturedProviderUsages(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(formatCapturedProviderUsages(undefined)).toBeNull();
    });

    it('returns null for an empty array', () => {
      expect(formatCapturedProviderUsages([])).toBeNull();
    });

    it('formats a single usage as a plain object (not wrapped in array)', () => {
      const result = formatCapturedProviderUsages([{ ...base, model: 'llama3', responseId: 'r1' }]);
      expect(result).not.toBeNull();
      const parsed: Record<string, unknown> = JSON.parse(result!) as Record<string, unknown>;
      expect(Array.isArray(parsed)).toBe(false);
      expect(parsed['providerId']).toBe('groq');
      expect(parsed['model']).toBe('llama3');
      expect(parsed['responseId']).toBe('r1');
      expect(parsed['source']).toBe('json');
      expect(parsed).not.toHaveProperty('capturedAt');
    });

    it('formats multiple usages as an array', () => {
      const result = formatCapturedProviderUsages([base, { ...base, providerId: 'openai' }]);
      expect(result).not.toBeNull();
      const parsed: unknown[] = JSON.parse(result!) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });

    it('omits model and responseId when absent', () => {
      const result = formatCapturedProviderUsages([base]);
      const parsed: Record<string, unknown> = JSON.parse(result!) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('model');
      expect(parsed).not.toHaveProperty('responseId');
    });
  });

  describe('registerQuotaUpdateSink', () => {
    afterEach(() => { registerQuotaUpdateSink(null); });

    it('accepts a function without throwing', () => {
      expect(() => registerQuotaUpdateSink(() => {})).not.toThrow();
    });

    it('accepts null to deregister', () => {
      registerQuotaUpdateSink(() => {});
      expect(() => registerQuotaUpdateSink(null)).not.toThrow();
    });
  });

  describe('setParallelToolsDisabled', () => {
    afterEach(() => { setParallelToolsDisabled('test-provider', false); });

    it('enables without throwing', () => {
      expect(() => setParallelToolsDisabled('test-provider', true)).not.toThrow();
    });

    it('disables without throwing', () => {
      setParallelToolsDisabled('test-provider', true);
      expect(() => setParallelToolsDisabled('test-provider', false)).not.toThrow();
    });
  });

  describe('getLastCapturedHeaders', () => {
    it('returns null for a provider with no recorded headers', () => {
      expect(getLastCapturedHeaders('unknown-provider-xyz')).toBeNull();
    });
  });

  describe('beginProviderUsageCapture / endProviderUsageCapture', () => {
    it('end without begin returns an empty array', async () => {
      const result = await endProviderUsageCapture('never-begun');
      expect(result).toEqual([]);
    });

    it('begin then end with no captures returns empty array', async () => {
      beginProviderUsageCapture('empty-capture-test');
      const result = await endProviderUsageCapture('empty-capture-test');
      expect(result).toEqual([]);
    });

    it('end clears the session so a second end returns empty', async () => {
      beginProviderUsageCapture('double-end-test');
      await endProviderUsageCapture('double-end-test');
      const second = await endProviderUsageCapture('double-end-test');
      expect(second).toEqual([]);
    });
  });

  describe('OpenAI-compatible HTTP errors', () => {
    it('includes provider JSON error details', async () => {
      const response = new Response(
        JSON.stringify({ error: { message: 'User not found.', code: 401 } }),
        { status: 401, statusText: 'Unauthorized' },
      );

      await expect(formatOpenAICompatHttpError('OpenRouter', response))
        .resolves.toBe('OpenRouter HTTP 401 Unauthorized: User not found. (code: 401)');
    });

    it('omits retry hint when retry-after header is absent', async () => {
      const response = new Response(
        JSON.stringify({ error: { message: 'Rate limited', code: 429 } }),
        { status: 429, statusText: 'Too Many Requests' },
      );

      const result = await formatOpenAICompatHttpError('Groq', response);
      expect(result).toBe('Groq HTTP 429 Too Many Requests: Rate limited (code: 429)');
      expect(result).not.toContain('Retry after');
    });

    it('adds OpenRouter rate-limit guidance for 429s', async () => {
      const response = new Response(
        JSON.stringify({ error: { message: 'Provider returned error', code: 429 } }),
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after': '12' },
        },
      );

      await expect(formatOpenAICompatHttpError('OpenRouter', response, providerQuirks['openrouter'].httpErrorHint))
        .resolves.toBe(
          'OpenRouter HTTP 429 Too Many Requests: Provider returned error (code: 429) Retry after 12 seconds. OpenRouter rate limits can come from OpenRouter or the upstream model provider; try again later or switch models/providers.',
        );
    });
  });

});
