import { isRecord } from '../../util/guards.js';

// SSE / response-body transforms shared by the OpenAI-compatible adapter.
// These are pure functions over request/response bodies — no provider state,
// no network — so they live apart from the adapter factory.

function normalizeOpenAICompatToolCallDelta(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const choices = value['choices'];
  if (!Array.isArray(choices)) return value;

  let changed = false;
  const nextChoices = choices.map((choice: unknown) => {
    if (!isRecord(choice)) return choice;
    const delta = choice['delta'];
    if (!isRecord(delta)) return choice;
    const toolCalls = delta['tool_calls'];
    if (!Array.isArray(toolCalls)) return choice;
    const nextToolCalls = toolCalls.map((toolCall: unknown) => {
      if (!isRecord(toolCall)) return toolCall;
      if (toolCall['type'] === 'function') return toolCall;
      if (!isRecord(toolCall['function'])) return toolCall;
      changed = true;
      return { ...toolCall, type: 'function' };
    });
    return { ...choice, delta: { ...delta, tool_calls: nextToolCalls } };
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
      const deltaToolCalls = rawToolCalls.map((tc: unknown, i: number) => {
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

/**
 * Wrap a streaming OpenAI-compatible response so each SSE chunk passes through
 * normalizeOpenAICompatToolCallSse. Non-streaming or non-OK responses are
 * returned untouched.
 */
export function normalizeOpenAICompatToolCallResponse(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('text/event-stream') || !response.body) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let remainder = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = remainder + decoder.decode(chunk, { stream: true });
      const lastNewline = text.lastIndexOf('\n');
      if (lastNewline === -1) {
        remainder = text;
        return;
      }
      const complete = text.slice(0, lastNewline + 1);
      remainder = text.slice(lastNewline + 1);
      controller.enqueue(encoder.encode(normalizeOpenAICompatToolCallSse(complete)));
    },
    flush(controller) {
      if (remainder) controller.enqueue(encoder.encode(normalizeOpenAICompatToolCallSse(remainder)));
    },
  });

  return new Response(response.body.pipeThrough(transformStream), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
