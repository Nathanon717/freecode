import { describe, it, expect } from 'vitest';
import {
  formatOpenAICompatHttpError,
  getOpenAICompatProviderHeaders,
  normalizeOpenAICompatToolCallSse,
  openAIModelDisallowsTemperature,
  mistralJsonToSse,
} from '../src/providers/adapters/openai-compat.js';

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

  describe('OpenAI temperature handling', () => {
    it('detects OpenAI models that only accept default temperature', () => {
      expect(openAIModelDisallowsTemperature('gpt-5.5')).toBe(true);
      expect(openAIModelDisallowsTemperature('gpt-5.5-2026-05-01')).toBe(true);
      expect(openAIModelDisallowsTemperature('gpt-5')).toBe(true);
      expect(openAIModelDisallowsTemperature('o3-mini')).toBe(true);
    });

    it('does not match unrelated OpenAI-compatible model IDs', () => {
      expect(openAIModelDisallowsTemperature('gpt-4o')).toBe(false);
      expect(openAIModelDisallowsTemperature('openai/gpt-5.5')).toBe(false);
      expect(openAIModelDisallowsTemperature('llama-3.3-70b')).toBe(false);
    });
  });

  describe('mistralJsonToSse', () => {
    function parseSseChunks(sseText: string): unknown[] {
      return sseText
        .split(/\r?\n/)
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice('data:'.length).trim())
        .filter(d => d && d !== '[DONE]')
        .map(d => JSON.parse(d) as unknown);
    }

    it('converts a text response to SSE chunks with role, content, and finish_reason', () => {
      const json = {
        id: 'abc', model: 'mistral-small-latest', created: 1000, object: 'chat.completion',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok', tool_calls: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      };
      const chunks = parseSseChunks(mistralJsonToSse(json));
      expect(chunks.length).toBe(3); // role+content, finish_reason, usage
      const first = chunks[0] as Record<string, unknown>;
      const choices0 = (first.choices as Array<Record<string, unknown>>)[0];
      const delta0 = choices0.delta as Record<string, unknown>;
      expect(delta0.role).toBe('assistant');
      expect(delta0.content).toBe('ok');
      expect(choices0.finish_reason).toBeNull();
      const second = chunks[1] as Record<string, unknown>;
      const choices1 = (second.choices as Array<Record<string, unknown>>)[0];
      expect(choices1.finish_reason).toBe('stop');
      const usageChunk = chunks[2] as Record<string, unknown>;
      expect(usageChunk.usage).toEqual({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 });
    });

    it('converts a tool-call response preserving id, name, arguments, and type', () => {
      const json = {
        id: 'tc1', model: 'mistral-small-latest', created: 2000, object: 'chat.completion',
        choices: [{
          index: 0, finish_reason: 'tool_calls',
          message: {
            role: 'assistant', content: '',
            tool_calls: [{ index: 0, id: 'BuAmSVo3l', function: { name: 'calculator', arguments: '{"expression":"2+2"}' } }],
          },
        }],
        usage: { prompt_tokens: 94, completion_tokens: 13, total_tokens: 107 },
      };
      const chunks = parseSseChunks(mistralJsonToSse(json));
      expect(chunks.length).toBe(3); // tool-call delta, finish_reason, usage
      const first = chunks[0] as Record<string, unknown>;
      const choices0 = (first.choices as Array<Record<string, unknown>>)[0];
      const delta0 = choices0.delta as Record<string, unknown>;
      const tc = (delta0.tool_calls as Array<Record<string, unknown>>)[0];
      expect(tc.id).toBe('BuAmSVo3l');
      expect(tc.type).toBe('function');
      const fn = tc.function as Record<string, unknown>;
      expect(fn.name).toBe('calculator');
      expect(fn.arguments).toBe('{"expression":"2+2"}');
      const second = chunks[1] as Record<string, unknown>;
      expect(((second.choices as Array<Record<string, unknown>>)[0]).finish_reason).toBe('tool_calls');
    });

    it('ends with [DONE]', () => {
      const sseText = mistralJsonToSse({ id: 'x', model: 'm', created: 0, choices: [], usage: null });
      expect(sseText.trimEnd().endsWith('[DONE]')).toBe(true);
    });

    it('handles null/unexpected input gracefully', () => {
      expect(mistralJsonToSse(null)).toBe('data: [DONE]\n\n');
    });
  });

  describe('OpenAI-compatible stream compatibility', () => {
    it('adds missing function type to streamed tool-call deltas', () => {
      const sse = [
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{}"}}]}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');

      expect(normalizeOpenAICompatToolCallSse(sse)).toBe([
        'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{}"},"type":"function"}]}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'));
    });
  });
});
