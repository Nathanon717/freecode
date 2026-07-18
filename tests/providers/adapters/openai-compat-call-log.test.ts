// check-tests: orphan
// Asserts the call-log WIRING inside createOpenAICompatProvider's customFetch:
// every exit from the fetch wrapper — success, HTTP error, transport failure —
// must produce exactly one recordLlmCall. This is the "impossible to make a call
// without logging it" guarantee; a refactor that drops a log call fails here.
//
// recordLlmCall is mocked because this file tests wiring, not persistence — the
// recordLlmCall -> SQLite round-trip is covered for real in
// tests/providers/call-log.test.ts. Together they cover the whole chain.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProviderConfig } from '../../../src/providers/types.js';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => ({})),
}));

vi.mock('../../../src/config/index.js', () => ({
  loadConfig: vi.fn(() => ({ retryMaxWaitSeconds: 30 })),
  resolveApiKey: vi.fn(() => 'test-key'),
}));

vi.mock('../../../src/providers/model-data.js', () => ({
  saveObservedRateLimits: vi.fn(),
}));

vi.mock('../../../src/providers/adapters/adapter-http-retry.js', () => ({
  fetchWithRetry: vi.fn(),
  formatOpenAICompatHttpError: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/providers/call-log.js', async (importOriginal) => ({
  // tokensFromUsagePayload stays REAL so the token assertions below exercise the
  // actual parse, not a stub that would pass regardless.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  ...(await importOriginal<typeof import('../../../src/providers/call-log.js')>()),
  recordLlmCall: vi.fn(),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createOpenAI } from '@ai-sdk/openai';
import { fetchWithRetry, formatOpenAICompatHttpError } from '../../../src/providers/adapters/adapter-http-retry.js';
import { recordLlmCall } from '../../../src/providers/call-log.js';
import { createOpenAICompatProvider } from '../../../src/providers/adapters/openai-compat.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const URL = 'https://api.example.com/v1/chat/completions';

function makeConfig(id: string): ProviderConfig {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    type: 'openai-compat',
    baseUrl: 'https://api.example.com/v1',
    apiKeyEnvVar: 'TEST_KEY',
    models: [],
  };
}

function customFetchFor(providerId: string): typeof globalThis.fetch {
  createOpenAICompatProvider(makeConfig(providerId));
  const calls = vi.mocked(createOpenAI).mock.calls;
  const lastArgs = calls[calls.length - 1][0] as { fetch?: typeof globalThis.fetch };
  return lastArgs.fetch!;
}

function init(model: string): RequestInit {
  return { method: 'POST', body: JSON.stringify({ model, messages: [] }) };
}

/** Flush the microtasks the log tee is queued on (it deliberately isn't awaited). */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function loggedRow() {
  const calls = vi.mocked(recordLlmCall).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(formatOpenAICompatHttpError).mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('openai-compat call log: success path', () => {
  it('logs provider-reported tokens from a JSON response', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(new Response(
      JSON.stringify({ id: 'r1', model: 'llama-3.3-70b-versatile', usage: { prompt_tokens: 31, completion_tokens: 9, total_tokens: 40 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await customFetchFor('groq')(URL, init('llama-3.3-70b-versatile'));
    await flush();

    expect(loggedRow()).toMatchObject({
      modelKey: 'groq:llama-3.3-70b-versatile',
      status: 200,
      inputTokens: 31,
      outputTokens: 9,
      totalTokens: 40,
    });
  });

  it('logs tokens from the final usage chunk of an SSE stream', async () => {
    const sse = [
      'data: {"id":"r2","model":"big-pickle","choices":[{"delta":{"content":"hi"}}]}',
      'data: {"id":"r2","model":"big-pickle","usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}',
      'data: [DONE]',
    ].join('\n\n');
    vi.mocked(fetchWithRetry).mockResolvedValue(new Response(sse, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }));

    await customFetchFor('zen')(URL, init('big-pickle'));
    await flush();

    expect(loggedRow()).toMatchObject({
      modelKey: 'zen:big-pickle',
      status: 200,
      inputTokens: 12,
      outputTokens: 3,
      totalTokens: 15,
    });
  });

  it('still logs the call when the provider sends no usage object', async () => {
    // The whole point of the log: a free model that reports nothing must still
    // produce a timestamped row, with tokens null rather than zero.
    vi.mocked(fetchWithRetry).mockResolvedValue(new Response(
      JSON.stringify({ id: 'r3', choices: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await customFetchFor('zen')(URL, init('deepseek-v4-flash-free'));
    await flush();

    const row = loggedRow();
    expect(row).toMatchObject({ modelKey: 'zen:deepseek-v4-flash-free', status: 200 });
    expect(row['inputTokens']).toBeNull();
    expect(row['outputTokens']).toBeNull();
    expect(row['totalTokens']).toBeNull();
  });
});

describe('openai-compat call log: failure paths', () => {
  it('logs the status and error text of an HTTP error, then rethrows', async () => {
    vi.mocked(fetchWithRetry).mockResolvedValue(new Response('{}', { status: 429 }));
    vi.mocked(formatOpenAICompatHttpError).mockResolvedValue('Groq: rate limit exceeded');

    await expect(customFetchFor('groq')(URL, init('llama-3.3-70b-versatile')))
      .rejects.toThrow('rate limit exceeded');
    await flush();

    expect(loggedRow()).toMatchObject({
      modelKey: 'groq:llama-3.3-70b-versatile',
      status: 429,
      error: 'Groq: rate limit exceeded',
    });
  });

  it('logs a transport failure with a null status, then rethrows', async () => {
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error('ECONNRESET'));

    await expect(customFetchFor('groq')(URL, init('llama-3.3-70b-versatile')))
      .rejects.toThrow('ECONNRESET');
    await flush();

    const row = loggedRow();
    expect(row).toMatchObject({ modelKey: 'groq:llama-3.3-70b-versatile', error: 'ECONNRESET' });
    expect(row['status']).toBeUndefined();
  });

  it('logs under a placeholder key when the request body has no model', async () => {
    // An unparseable body must not cost us the row — the timestamp still counts.
    vi.mocked(fetchWithRetry).mockRejectedValue(new Error('boom'));

    await expect(customFetchFor('groq')(URL, { method: 'POST', body: 'not-json' }))
      .rejects.toThrow('boom');
    await flush();

    expect(loggedRow()).toMatchObject({ modelKey: 'groq:unknown' });
  });
});
