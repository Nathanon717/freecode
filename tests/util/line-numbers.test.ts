import { describe, expect, it } from 'vitest';
import { withLineNumbers } from '../../src/util/line-numbers.js';

describe('withLineNumbers', () => {
  it('prefixes each line with its 1-based number and a colon', () => {
    expect(withLineNumbers(1, ['a', 'b', 'c'])).toEqual(['1: a', '2: b', '3: c']);
  });

  it('right-aligns numbers so colons align across digit widths', () => {
    expect(withLineNumbers(9, ['x', 'y', 'z'])).toEqual([' 9: x', '10: y', '11: z']);
  });

  it('honors a non-1 start line', () => {
    expect(withLineNumbers(100, ['a'])).toEqual(['100: a']);
  });

  it('returns an empty array for no lines', () => {
    expect(withLineNumbers(1, [])).toEqual([]);
  });
});
