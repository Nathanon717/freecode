import type { CoreMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { estimateContextTokens } from '../src/agent/token-count.js';

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
