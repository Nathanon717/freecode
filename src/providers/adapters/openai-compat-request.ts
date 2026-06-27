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

export function injectParallelToolCallsFalse(body: Record<string, unknown>): Record<string, unknown> {
  const tools = body['tools'];
  if (!Array.isArray(tools) || tools.length === 0) return body;
  return { ...body, parallel_tool_calls: false };
}
