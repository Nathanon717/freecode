import {
  openAIModelDisallowsTemperature,
  mistralCodestralRequiresSystemInjection,
  injectSystemIntoFirstUserMessage,
} from '../model-quirks.js';

// Pure request-body transforms for OpenAI-compatible providers. No provider
// state, no network — mirrors the response-side openai-compat-sse.ts.
// These are called from quirk profiles in openai-compat-quirks.ts.

export function stripTemperatureIfDisallowed(body: Record<string, unknown>): Record<string, unknown> {
  const model = typeof body['model'] === 'string' ? body['model'] : '';
  if (!openAIModelDisallowsTemperature(model) || !('temperature' in body)) return body;
  const { temperature: _t, ...rest } = body;
  return rest;
}

export function stripStreamForNonStream(body: Record<string, unknown>): { body: Record<string, unknown>; forcedNonStream: boolean } {
  if (!body['stream']) return { body, forcedNonStream: false };
  const { stream: _s, stream_options: _so, ...rest } = body;
  return { body: rest, forcedNonStream: true };
}

export function injectCodestralSystem(body: Record<string, unknown>): Record<string, unknown> {
  const model = typeof body['model'] === 'string' ? body['model'] : '';
  if (!mistralCodestralRequiresSystemInjection(model) || !Array.isArray(body['messages'])) return body;
  return { ...body, messages: injectSystemIntoFirstUserMessage(body['messages'] as Array<Record<string, unknown>>) };
}

/**
 * Give every assistant message that carries `tool_calls` a `reasoning_content`
 * field, so a thinking model's own tool call is legal to send back to it.
 *
 * DeepSeek's API rejects a continuation whose assistant `tool_calls` message has
 * no `reasoning_content` — "The `reasoning_content` in the thinking mode must be
 * passed back to the API" (HTTP 400). The AI SDK never surfaces the field in the
 * first place: `reasoning_content` deltas are dropped while parsing the response
 * stream, so nothing downstream can put it back. The check is on *presence*, not
 * on the text, which is why an empty string satisfies it — verified against
 * `zen:big-pickle`, which fails 100% without the field and passes 100% with it.
 *
 * Assistant messages with only text are exempt: they are accepted without the
 * field, so this adds nothing to them.
 *
 * See `docs/bug log/06-08-2026.md`.
 */
export function ensureAssistantReasoningContent(body: Record<string, unknown>): Record<string, unknown> {
  const messages = body['messages'];
  if (!Array.isArray(messages)) return body;

  let changed = false;
  const next = messages.map((message: unknown) => {
    if (!message || typeof message !== 'object') return message;
    const record = message as Record<string, unknown>;
    if (record['role'] !== 'assistant') return record;
    if (!Array.isArray(record['tool_calls']) || record['tool_calls'].length === 0) return record;
    if (typeof record['reasoning_content'] === 'string') return record;
    changed = true;
    return { ...record, reasoning_content: '' };
  });

  return changed ? { ...body, messages: next } : body;
}

export function injectParallelToolCallsFalse(body: Record<string, unknown>): Record<string, unknown> {
  const tools = body['tools'];
  if (!Array.isArray(tools) || tools.length === 0) return body;
  return { ...body, parallel_tool_calls: false };
}
