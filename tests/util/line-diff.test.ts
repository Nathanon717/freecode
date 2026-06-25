import { describe, expect, it } from 'vitest';
import { computeLineDiff } from '../../src/util/line-diff.js';

describe('computeLineDiff', () => {
  it('returns equal entries for identical lines', () => {
    const diff = computeLineDiff(['a', 'b'], ['a', 'b']);
    expect(diff).toEqual([
      { type: 'equal', text: 'a' },
      { type: 'equal', text: 'b' },
    ]);
  });

  it('returns add/remove for completely different lines', () => {
    const diff = computeLineDiff(['old'], ['new']);
    expect(diff).toEqual([
      { type: 'remove', text: 'old' },
      { type: 'add', text: 'new' },
    ]);
  });

  it('handles empty old lines', () => {
    const diff = computeLineDiff([], ['a', 'b']);
    expect(diff).toEqual([
      { type: 'add', text: 'a' },
      { type: 'add', text: 'b' },
    ]);
  });

  it('handles empty new lines', () => {
    const diff = computeLineDiff(['a', 'b'], []);
    expect(diff).toEqual([
      { type: 'remove', text: 'a' },
      { type: 'remove', text: 'b' },
    ]);
  });

  it('computes LCS-based diff correctly', () => {
    const diff = computeLineDiff(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(diff).toEqual([
      { type: 'equal', text: 'a' },
      { type: 'remove', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'equal', text: 'c' },
    ]);
  });
});
