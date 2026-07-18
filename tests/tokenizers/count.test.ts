import type { CoreMessage } from 'ai';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';
import { estimateContextTokens, estimateTextTokens } from '../../src/tokenizers/fallback-estimate.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const MINI_FIXTURE = resolve(_dirname, 'fixtures', 'mini-tokenizer.json');

// Stubs the network hop only: ensureTokenizerFile normally downloads from HF,
// but here it resolves instantly to a tiny committed fixture, so
// preloadTokenizerFor's real ensure→load→cache wiring (and the real
// @huggingface/tokenizers parse in backends/bpe-json.ts) run genuinely, just
// without touching the network in the unit-test suite.
vi.mock('../../src/tokenizers/download-tokenizer.js', () => ({
  ensureTokenizerFile: vi.fn(() => Promise.resolve(MINI_FIXTURE)),
}));

const { countTokens, countTextTokens, preloadTokenizerFor } = await import('../../src/tokenizers/count.js');

describe('countTokens', () => {
  it('falls back to the generic tiktoken estimate when no family is resolved', () => {
    const messages: CoreMessage[] = [{ role: 'user', content: 'hello there' }];
    expect(countTokens(messages, 'openrouter:moonshotai/kimi-k2-instruct')).toBe(estimateContextTokens(messages));
  });

  it('falls back to the generic estimate for a resolved family whose encoder has not been preloaded', () => {
    // Uses the GLM-4 family specifically because no other test in this file
    // ever preloads it — the llama-3 family IS preloaded by a test below, and
    // encoderCache is module-level state shared across tests in this file, so
    // asserting the fallback on an already-preloaded family would only pass
    // by run-order accident.
    const messages: CoreMessage[] = [{ role: 'user', content: 'hello there' }];
    expect(countTokens(messages, 'openrouter:z-ai/glm-4.6')).toBe(estimateContextTokens(messages));
  });

  it('never throws for an unrecognized or empty model ID', () => {
    expect(() => countTokens([], '')).not.toThrow();
    expect(() => countTokens([], 'totally-unknown-model')).not.toThrow();
  });

  it('never throws on message content containing a tiktoken special-token string', () => {
    const messages: CoreMessage[] = [{ role: 'user', content: 'pasted: <|endoftext|>' }];
    expect(() => countTokens(messages, 'groq:llama-3.3-70b-versatile')).not.toThrow();
  });
});

describe('countTextTokens', () => {
  it('returns the generic estimate and exact:false when no encoder is loaded', () => {
    // deepseek-v4 family: no test here ever preloads it, so encoderCache misses.
    const { tokens, exact } = countTextTokens('hello there', 'openrouter:deepseek/deepseek-v4');
    expect(exact).toBe(false);
    expect(tokens).toBe(estimateTextTokens('hello there'));
  });

  it('counts bare text without chat/system-prompt overhead (unlike countTokens)', () => {
    // The single-message context count carries per-message + per-request +
    // system-prompt overhead; the bare-text count must be strictly smaller.
    const text = 'hello there';
    expect(countTextTokens(text, 'unknown-model').tokens)
      .toBeLessThan(countTokens([{ role: 'user', content: text }], 'unknown-model'));
  });

  it('uses the exact encoder and reports exact:true once the family is preloaded', async () => {
    await preloadTokenizerFor('groq:openai/gpt-oss-120b');
    const { tokens, exact } = countTextTokens('hello there', 'groq:openai/gpt-oss-120b');
    expect(exact).toBe(true);
    expect(tokens).toBeGreaterThan(0);
  });

  it('never throws on special-token strings or an unknown model', () => {
    expect(() => countTextTokens('pasted: <|endoftext|>', 'groq:llama-3.3-70b-versatile')).not.toThrow();
    expect(() => countTextTokens('', '')).not.toThrow();
  });
});

describe('preloadTokenizerFor', () => {
  it('resolves without throwing for an unresolved family', async () => {
    await expect(preloadTokenizerFor('openrouter:moonshotai/kimi-k2-instruct')).resolves.toBeUndefined();
  });

  it('preloads the GPT-OSS encoder without throwing, and countTokens keeps working afterward', async () => {
    const messages: CoreMessage[] = [{ role: 'user', content: 'hello there' }];
    await expect(preloadTokenizerFor('groq:openai/gpt-oss-120b')).resolves.toBeUndefined();
    expect(() => countTokens(messages, 'groq:openai/gpt-oss-120b')).not.toThrow();
  });

  it('preloads an HF fast-tokenizer family (ensure-download → load → cache) and countTokens reads it afterward', async () => {
    const messages: CoreMessage[] = [{ role: 'user', content: 'abc' }];
    await expect(preloadTokenizerFor('groq:llama-3.3-70b-versatile')).resolves.toBeUndefined();
    expect(countTokens(messages, 'groq:llama-3.3-70b-versatile'))
      .not.toBe(estimateContextTokens(messages));
  });
});
