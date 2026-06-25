import { describe, expect, it } from 'vitest';
import { modelSlug } from '../../src/eval/playground.js';

describe('modelSlug', () => {
  it('replaces colons and slashes with double dashes', () => {
    expect(modelSlug('openai:gpt-4o')).toBe('openai--gpt-4o');
    expect(modelSlug('zen:deepseek/v4-flash')).toBe('zen--deepseek--v4-flash');
  });
});
