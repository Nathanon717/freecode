import type { CoreMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  estimateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
} from '../../src/agent/token-count.js';

describe('estimateTextTokens', () => {
  it('returns 0 for empty string (null coalescing branch)', () => {
    expect(estimateTextTokens('')).toBe(0);
  });

  it('returns 0 for whitespace-only string (null coalescing branch)', () => {
    expect(estimateTextTokens('   ')).toBe(0);
  });

  it('gives short words a minimum of 1 token', () => {
    expect(estimateTextTokens('a')).toBe(1);   // ceil(1/4)=1
    expect(estimateTextTokens('ok')).toBe(1);  // ceil(2/4)=1
    expect(estimateTextTokens('hi')).toBe(1);  // ceil(2/4)=1
  });

  it('counts longer words by ceil(length / 4)', () => {
    expect(estimateTextTokens('hello')).toBe(2);         // ceil(5/4)=2
    expect(estimateTextTokens('superlongword')).toBe(4); // ceil(13/4)=4
  });

  it('counts non-alphanumeric characters as 1 token each', () => {
    expect(estimateTextTokens('...')).toBe(3);
    expect(estimateTextTokens('!')).toBe(1);
  });

  it('combines alphanumeric and punctuation in one string', () => {
    // 'hello'(2) + '!'(1) = 3
    expect(estimateTextTokens('hello!')).toBe(3);
  });

  it('ignores whitespace between words', () => {
    // 'hello'(2) + ' '(ignored) + 'world'(2) = 4
    expect(estimateTextTokens('hello world')).toBe(4);
  });

  it('treats underscore as alphanumeric', () => {
    // 'some_var' = 8 chars → ceil(8/4)=2
    expect(estimateTextTokens('some_var')).toBe(2);
  });
});

describe('estimateMessageTokens', () => {
  // overhead constant is 4 + tokens(role) + tokens(content)

  it('handles string content', () => {
    // 'user'(1) + 'hello'(2) + overhead(4) = 7
    const msg: CoreMessage = { role: 'user', content: 'hello' };
    expect(estimateMessageTokens(msg)).toBe(7);
  });

  it('handles null content', () => {
    // stringifyContent(null) → ''  → 0 tokens; 4 + 1 + 0 = 5
    const msg = { role: 'user', content: null } as unknown as CoreMessage;
    expect(estimateMessageTokens(msg)).toBe(5);
  });

  it('handles undefined content', () => {
    // stringifyContent(undefined) → ''
    const msg = { role: 'user', content: undefined } as unknown as CoreMessage;
    expect(estimateMessageTokens(msg)).toBe(5);
  });

  it('handles numeric content', () => {
    // String(42) = '42' → 1 token; 4 + 1 + 1 = 6
    const msg = { role: 'user', content: 42 } as unknown as CoreMessage;
    expect(estimateMessageTokens(msg)).toBe(6);
  });

  it('handles boolean content', () => {
    // String(true) = 'true' → 1 token; 4 + 1 + 1 = 6
    const msg = { role: 'user', content: true } as unknown as CoreMessage;
    expect(estimateMessageTokens(msg)).toBe(6);
  });

  it('handles array content whose text parts use the text field', () => {
    // stringifyContent([{type:'text', text:'hi'}]) → map→['hi']→filter→join→'hi'(1 token)
    const msg: CoreMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    };
    // 4 + 1 + 1 = 6
    expect(estimateMessageTokens(msg)).toBe(6);
  });

  it('filters falsy array elements (null/undefined items produce empty strings)', () => {
    // null → '', undefined → '', then filter(Boolean) removes them
    const msg = {
      role: 'user',
      content: [null, undefined, { type: 'text', text: 'hello' }],
    } as unknown as CoreMessage;
    // only 'hello'(2) survives; 4 + 1 + 2 = 7
    expect(estimateMessageTokens(msg)).toBe(7);
  });

  it('handles object content with a text field', () => {
    const msg = {
      role: 'user',
      content: { text: 'hi' },
    } as unknown as CoreMessage;
    // 4 + 1 + 1 = 6
    expect(estimateMessageTokens(msg)).toBe(6);
  });

  it('handles object content with a content field but no text field', () => {
    const msg = {
      role: 'user',
      content: { content: 'hi' },
    } as unknown as CoreMessage;
    // text field missing → falls to content check; 4 + 1 + 1 = 6
    expect(estimateMessageTokens(msg)).toBe(6);
  });

  it('falls back to JSON.stringify for plain objects without text or content', () => {
    // {type:'image',url:'x'} → JSON.stringify → some non-zero token count
    const msg = {
      role: 'user',
      content: { type: 'image', url: 'x' },
    } as unknown as CoreMessage;
    expect(estimateMessageTokens(msg)).toBeGreaterThan(4);
  });

  it('handles bigint content', () => {
    // String(BigInt(100)) = '100' → 1 token; 4 + 1 + 1 = 6
    const msg = {
      role: 'user',
      content: BigInt(100),
    } as unknown as CoreMessage;
    expect(estimateMessageTokens(msg)).toBe(6);
  });

  it('handles symbol content', () => {
    // String(Symbol('t')) = 'Symbol(t)' → some tokens
    const msg = {
      role: 'user',
      content: Symbol('t'),
    } as unknown as CoreMessage;
    expect(estimateMessageTokens(msg)).toBeGreaterThan(4);
  });

  it('hits the final default fallback for function values', () => {
    // functions are not string/null/number/bool/array/object/bigint/symbol
    // so stringifyContent returns '' via the final `return ''`
    const msg = {
      role: 'user',
      content: () => 'fn',
    } as unknown as CoreMessage;
    // 4 + 1 + 0 = 5
    expect(estimateMessageTokens(msg)).toBe(5);
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
