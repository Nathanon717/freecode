import { describe, expect, it } from 'vitest';
import { getInlineCompletionSuffix } from '../../src/cli/terminal-ui.js';

describe('inline command completion', () => {
  it('returns only the ghost suffix after the typed input', () => {
    expect(getInlineCompletionSuffix('/e', '/eval')).toBe('val');
    expect(getInlineCompletionSuffix('/eval', '/eval')).toBe('');
    expect(getInlineCompletionSuffix('hello', null)).toBe('');
  });
});
