import type { CoreMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  estimateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
} from '../../src/agent/token-count.js';

describe('estimateTextTokens', () => {
  // Whitespace is ignored; alphanumeric runs cost ceil(len/4) with a floor of 1;
  // each non-alphanumeric character costs 1.
  it.each([
    ['', 0],
    ['   ', 0],
    ['a', 1],
    ['ok', 1],
    ['hello', 2],            // ceil(5/4)
    ['superlongword', 4],    // ceil(13/4)
    ['some_var', 2],         // underscore is alphanumeric, ceil(8/4)
    ['...', 3],              // one token per punctuation char
    ['!', 1],
    ['hello!', 3],           // 'hello'(2) + '!'(1)
    ['hello world', 4],      // whitespace ignored: 'hello'(2) + 'world'(2)
  ])('%p → %i tokens', (text, expected) => {
    expect(estimateTextTokens(text)).toBe(expected);
  });
});

describe('estimateMessageTokens', () => {
  // overhead is 4 + tokens(role) + tokens(stringified content)
  it.each<[CoreMessage, number]>([
    [{ role: 'user', content: 'hello' }, 7],                            // 4 + 'user'(1) + 'hello'(2)
    [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }, 6],     // 4 + 1 + 'hi'(1)
    [
      // falsy array elements are filtered before counting
      { role: 'user', content: [null, undefined, { type: 'text', text: 'hello' }] } as unknown as CoreMessage,
      7,                                                                 // 4 + 1 + 'hello'(2)
    ],
  ])('counts %j as %i tokens', (msg, expected) => {
    expect(estimateMessageTokens(msg)).toBe(expected);
  });

  it('JSON-stringifies content parts without a text/content string field', () => {
    const msg: CoreMessage = { role: 'user', content: [{ type: 'image', image: 'x' }] };
    expect(estimateMessageTokens(msg)).toBeGreaterThan(4);
  });
});

describe('estimateContextTokens', () => {
  it('counts the current model context from system prompt and messages', () => {
    const emptyContext = estimateContextTokens([]);
    const withHistory = estimateContextTokens([
      { role: 'user', content: 'Summarize this project.' },
      { role: 'assistant', content: 'This is a TypeScript CLI coding agent.' },
    ]);

    expect(emptyContext).toBeGreaterThan(0);
    expect(withHistory).toBeGreaterThan(emptyContext);
  });

  it('depends on retained history, not cumulative usage from previous calls', () => {
    const compactHistory: CoreMessage[] = [
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'done' },
    ];
    const repeatedEstimate = estimateContextTokens(compactHistory);

    expect(estimateContextTokens(compactHistory)).toBe(repeatedEstimate);
    expect(estimateContextTokens([])).toBeLessThan(repeatedEstimate);
  });
});
