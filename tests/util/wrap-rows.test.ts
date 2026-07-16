import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitLinesToRows, terminalColumns, visualRows } from '../../src/util/wrap-rows.js';

// process.stdout.columns is a plain undefined property under a non-TTY test
// runner, so it must be defined rather than spied on.
function withColumns(cols: number | undefined, fn: () => void): void {
  const had = Object.prototype.hasOwnProperty.call(process.stdout, 'columns');
  const original = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
  Object.defineProperty(process.stdout, 'columns', {
    value: cols,
    configurable: true,
    writable: true,
  });
  try {
    fn();
  } finally {
    if (had && original) Object.defineProperty(process.stdout, 'columns', original);
    else delete (process.stdout as unknown as { columns?: number }).columns;
  }
}

const identity = (l: string) => l;

describe('wrap rows', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('counts a line that fits as one row and a wrapped line as several', () => {
    expect(visualRows('short', 80)).toBe(1);
    expect(visualRows('x'.repeat(80), 80)).toBe(1);
    expect(visualRows('x'.repeat(81), 80)).toBe(2);
    expect(visualRows('x'.repeat(200), 80)).toBe(3);
  });

  it('measures visible width only, ignoring ANSI colour codes', () => {
    expect(visualRows(`\x1b[2m${'x'.repeat(40)}\x1b[0m`, 80)).toBe(1);
  });

  it('treats an empty line as one row', () => {
    expect(visualRows('', 80)).toBe(1);
  });

  it('falls back to a default width when the terminal reports none', () => {
    withColumns(undefined, () => {
      vi.stubEnv('COLUMNS', '');
      expect(terminalColumns()).toBe(80);
    });
  });

  it('prefers the terminal width over COLUMNS', () => {
    withColumns(120, () => {
      vi.stubEnv('COLUMNS', '40');
      expect(terminalColumns()).toBe(120);
    });
  });

  it('keeps the lines that fit, reserving one row for the caller note', () => {
    withColumns(80, () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      // 10 rows of budget, 1 reserved for the note => 9 single-row lines.
      expect(fitLinesToRows(lines, 10, identity)).toHaveLength(9);
    });
  });

  it('budgets by wrapped rows, not by line count', () => {
    withColumns(80, () => {
      // Each line wraps to 3 rows; a 10-row budget (9 usable) fits only 3 of them.
      const lines = Array.from({ length: 20 }, () => 'x'.repeat(200));
      expect(fitLinesToRows(lines, 10, identity)).toHaveLength(3);
    });
  });

  it('measures the rendered form, so indentation counts toward the budget', () => {
    withColumns(10, () => {
      const lines = ['x'.repeat(9), 'y'.repeat(9)];
      // Each line fits one row bare, but wraps to two once indented by two.
      expect(visualRows(lines[0], 10)).toBe(1);
      expect(visualRows('  ' + lines[0], 10)).toBe(2);
      // Budget 4 => 3 usable rows: both fit bare (2 rows), only one fits
      // indented (4 rows would be needed).
      expect(fitLinesToRows(lines, 4, identity)).toEqual(lines);
      expect(fitLinesToRows(lines, 4, (l) => '  ' + l)).toEqual([lines[0]]);
    });
  });

  it('always keeps at least one line so an over-long line still shows its head', () => {
    withColumns(80, () => {
      expect(fitLinesToRows(['x'.repeat(4000)], 2, identity)).toHaveLength(1);
    });
  });

  it('returns everything when the budget is ample', () => {
    withColumns(80, () => {
      const lines = ['a', 'b', 'c'];
      expect(fitLinesToRows(lines, 50, identity)).toEqual(lines);
    });
  });
});
