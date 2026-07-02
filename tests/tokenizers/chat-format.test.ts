import type { CoreMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../src/agent/system-prompt.js';
import {
  countContextTokens,
  countMessageTokens,
  stringifyMessageContent,
  TOKENS_PER_MESSAGE_OVERHEAD,
  TOKENS_PER_REQUEST_OVERHEAD,
} from '../../src/tokenizers/chat-format.js';

const charCount = (text: string): number => text.length;

describe('stringifyMessageContent', () => {
  it.each([
    ['a plain string', 'hello', 'hello'],
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['an array of text parts', [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], 'a\nb'],
    ['an object with a content field', { content: 'c' }, 'c'],
  ])('stringifies %s', (_label, value, expected) => {
    expect(stringifyMessageContent(value)).toBe(expected);
  });

  it('JSON-stringifies a value with no text/content field', () => {
    const value = { type: 'image', image: 'x' };
    expect(stringifyMessageContent(value)).toBe(JSON.stringify(value));
  });
});

describe('countMessageTokens', () => {
  it('is fixed overhead plus encodeText counts for role and content', () => {
    const message: CoreMessage = { role: 'user', content: 'hi' };
    expect(countMessageTokens(message, charCount)).toBe(TOKENS_PER_MESSAGE_OVERHEAD + 'user'.length + 'hi'.length);
  });
});

describe('countContextTokens', () => {
  it('sums request overhead, the system prompt, and every message', () => {
    const messages: CoreMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'yo' },
    ];
    const expected = TOKENS_PER_REQUEST_OVERHEAD
      + charCount(buildSystemPrompt())
      + messages.reduce((total, m) => total + countMessageTokens(m, charCount), 0);
    expect(countContextTokens(messages, charCount)).toBe(expected);
  });
});
