import { describe, it, expect } from 'vitest';
import {
  normalizeOpenAICompatToolCallSse,
  normalizeOpenAICompatToolCallResponse,
  mistralJsonToSse,
} from '../../../src/providers/adapters/openai-compat-sse.js';

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

describe('normalizeOpenAICompatToolCallSse', () => {
  it('adds missing function type to streamed tool-call deltas', () => {
    const sse = [
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{}"}}]}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    expect(normalizeOpenAICompatToolCallSse(sse)).toBe([
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{}"},"type":"function"}]}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'));
  });

  it('leaves deltas that already have a type untouched', () => {
    const sse = 'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"type":"function","function":{"name":"x"}}]}}]}\n';
    expect(normalizeOpenAICompatToolCallSse(sse)).toBe(sse);
  });
});

describe('normalizeOpenAICompatToolCallResponse', () => {
  it('normalizes tool-call deltas across chunk boundaries in a streamed response', async () => {
    const lines = [
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{}"}}]}}]}\n',
      'data: [DONE]\n',
    ];
    // Split mid-line to exercise the remainder buffering.
    const whole = lines.join('');
    const splitAt = 30;
    const parts = [whole.slice(0, splitAt), whole.slice(splitAt)];

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const p of parts) controller.enqueue(encoder.encode(p));
        controller.close();
      },
    });
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });

    const out = await normalizeOpenAICompatToolCallResponse(response).text();
    expect(out).toContain('"type":"function"');
    expect(out.trimEnd().endsWith('[DONE]')).toBe(true);
  });

  it('returns non-streaming responses untouched', () => {
    const response = new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    expect(normalizeOpenAICompatToolCallResponse(response)).toBe(response);
  });
});
