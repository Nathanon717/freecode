import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoreTool } from 'ai';
import {
  buildOpenAIResponsesPayload,
  countOpenAIResponsesInputTokens,
  generateOpenAIResponses,
  hashOpenAIResponsesPayload,
} from '../src/providers/adapters/openai-responses.js';
import type { ProviderConfig } from '../src/providers/types.js';

const provider: ProviderConfig = {
  id: 'openai',
  name: 'OpenAI',
  type: 'openai-compat',
  baseUrl: 'https://api.openai.com/v1',
  apiKeyEnvVar: 'OPENAI_API_KEY',
  models: [],
};

function simpleTool(): CoreTool {
  return {
    parameters: {} as never,
    description: 'Echo a value',
    execute: async (args: unknown) => `echo:${JSON.stringify(args)}`,
  };
}

describe('OpenAI Responses adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('builds a Responses payload from system prompt, history, draft, model, and tools', () => {
    const payload = buildOpenAIResponsesPayload({
      modelId: 'gpt-5',
      systemPrompt: 'system text',
      messages: [
        { role: 'user', content: 'previous' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'draft' },
      ],
      tools: { read_file: simpleTool() },
    });

    expect(payload.model).toBe('gpt-5');
    expect(payload.instructions).toBe('system text');
    expect(payload.input).toMatchObject([
      { role: 'user' },
      { role: 'assistant' },
      { role: 'user' },
    ]);
    expect(JSON.stringify(payload)).toContain('draft');
    expect(payload.tools?.[0]).toMatchObject({ type: 'function', name: 'read_file' });
  });

  it('hashes the full payload stably and changes for relevant inputs', () => {
    const base = buildOpenAIResponsesPayload({
      modelId: 'gpt-5',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'one' }],
    });
    const same = buildOpenAIResponsesPayload({
      modelId: 'gpt-5',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'one' }],
    });
    const changed = buildOpenAIResponsesPayload({
      modelId: 'gpt-5',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'two' }],
    });

    expect(hashOpenAIResponsesPayload(base)).toBe(hashOpenAIResponsesPayload(same));
    expect(hashOpenAIResponsesPayload(base)).not.toBe(hashOpenAIResponsesPayload(changed));
  });

  it('counts input tokens through /responses/input_tokens', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      object: 'response.input_tokens',
      input_tokens: 123,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = buildOpenAIResponsesPayload({
      modelId: 'gpt-5',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'hello' }],
    });

    await expect(countOpenAIResponsesInputTokens(provider, payload)).resolves.toMatchObject({
      inputTokens: 123,
      payloadHash: expect.any(String),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses/input_tokens',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).not.toHaveProperty('store');
  });

  it('generates with Responses and executes function calls for at most ten steps', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp_tool',
      model: 'gpt-5',
      output: [{
        type: 'function_call',
        name: 'echo',
        call_id: 'call_1',
        arguments: '{"value":1}',
      }],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = buildOpenAIResponsesPayload({
      modelId: 'gpt-5',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'use tool' }],
      tools: { echo: simpleTool() },
    });

    const result = await generateOpenAIResponses(provider, payload, { echo: simpleTool() });

    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(result.usage).toEqual({ promptTokens: 1, outputTokens: 2, totalTokens: 3 });
    expect(result.providerUsage).toHaveLength(10);
  });

  it('does not replay stored response item ids after function calls', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp_tool',
        model: 'gpt-5.1-codex-mini',
        output: [{
          id: 'rs_123',
          type: 'function_call',
          name: 'echo',
          call_id: 'call_1',
          arguments: '{"value":1}',
        }],
        usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({
        id: 'resp_final',
        model: 'gpt-5.1-codex-mini',
        output_text: 'done',
        usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = buildOpenAIResponsesPayload({
      modelId: 'gpt-5.1-codex-mini',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'use tool' }],
      tools: { echo: simpleTool() },
    });

    await generateOpenAIResponses(provider, payload, { echo: simpleTool() });

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const secondBody = JSON.parse(String(secondRequest.body)) as { input: unknown[] };
    expect(JSON.stringify(secondBody.input)).not.toContain('rs_123');
    expect(secondBody.input).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'function_call',
        name: 'echo',
        call_id: 'call_1',
        arguments: '{"value":1}',
      }),
      expect.objectContaining({
        type: 'function_call_output',
        call_id: 'call_1',
        output: 'echo:{"value":1}',
      }),
    ]));
  });
});
