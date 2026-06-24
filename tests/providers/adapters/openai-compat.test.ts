import { describe, it, expect } from 'vitest';
import {
  formatOpenAICompatHttpError,
  getOpenAICompatProviderHeaders,
} from '../../../src/providers/adapters/openai-compat.js';

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

  describe('OpenAI-compatible HTTP errors', () => {
    it('includes provider JSON error details', async () => {
      const response = new Response(
        JSON.stringify({ error: { message: 'User not found.', code: 401 } }),
        { status: 401, statusText: 'Unauthorized' },
      );

      await expect(formatOpenAICompatHttpError('OpenRouter', response))
        .resolves.toBe('OpenRouter HTTP 401 Unauthorized: User not found. (code: 401)');
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

      await expect(formatOpenAICompatHttpError('OpenRouter', response))
        .resolves.toBe(
          'OpenRouter HTTP 429 Too Many Requests: Provider returned error (code: 429) Retry after 12 seconds. OpenRouter rate limits can come from OpenRouter or the upstream model provider; try again later or switch models/providers.',
        );
    });
  });

});
