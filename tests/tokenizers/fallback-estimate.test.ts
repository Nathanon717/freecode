import type { CoreMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { getEncoding } from 'js-tiktoken';
import {
  estimateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
} from '../../src/tokenizers/fallback-estimate.js';
import { buildSystemPrompt } from '../../src/agent/system-prompt.js';

const enc = getEncoding('o200k_base');

describe('estimateTextTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTextTokens('')).toBe(0);
  });

  it.each([
    'hello',
    'hello world',
    'a reasonably long sentence with punctuation, numbers (123), and symbols!',
    'function add(a: number, b: number): number { return a + b; }',
  ])('matches the real o200k_base BPE count for %p', (text) => {
    expect(estimateTextTokens(text)).toBe(enc.encode(text).length);
  });

  it('does not throw on text containing a tiktoken special-token string', () => {
    const text = 'pasted output: <|endoftext|> more text <|endofprompt|>';
    expect(() => estimateTextTokens(text)).not.toThrow();
    expect(estimateTextTokens(text)).toBe(enc.encode(text, [], []).length);
  });
});

describe('estimateMessageTokens', () => {
  it('is the fixed overhead plus real BPE counts for role and content', () => {
    const message: CoreMessage = { role: 'user', content: 'hello there' };
    const expected = 4 + enc.encode('user').length + enc.encode('hello there').length;
    expect(estimateMessageTokens(message)).toBe(expected);
  });

  it('stringifies array content parts with a text field', () => {
    const message: CoreMessage = { role: 'user', content: [{ type: 'text', text: 'hi there' }] };
    const expected = 4 + enc.encode('user').length + enc.encode('hi there').length;
    expect(estimateMessageTokens(message)).toBe(expected);
  });

  it('JSON-stringifies content parts without a text/content string field', () => {
    const message: CoreMessage = { role: 'user', content: [{ type: 'image', image: 'x' }] };
    expect(estimateMessageTokens(message)).toBeGreaterThan(4);
  });
});

describe('estimateContextTokens', () => {
  it('counts request overhead, system prompt, and all messages against real BPE output', () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: 'Summarize this project.' },
      { role: 'assistant', content: 'This is a TypeScript CLI coding agent.' },
    ];
    const expected = 2 + enc.encode(buildSystemPrompt()).length
      + messages.reduce((total, m) => total + 4 + enc.encode(m.role).length + enc.encode(m.content as string).length, 0);
    expect(estimateContextTokens(messages)).toBe(expected);
  });

  it('grows with retained history but stays pure across repeated calls', () => {
    const compactHistory: CoreMessage[] = [
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'done' },
    ];
    const repeated = estimateContextTokens(compactHistory);
    expect(estimateContextTokens(compactHistory)).toBe(repeated);
    expect(estimateContextTokens([])).toBeLessThan(repeated);
  });
});
