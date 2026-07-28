import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rows,
  cols,
  setScrollRegionSequence,
  setScrollRegion,
  resetScrollRegionSequence,
  resetScrollRegion,
  moveToSequence,
  moveTo,
  clearLineSequence,
  saveCursorSequence,
  restoreCursorSequence,
} from '../../../src/cli/chrome/ansi.js';

const ESC = '\x1b[';

function withGeometry(next: { rows?: number; columns?: number }, fn: () => void) {
  const prevRows = process.stdout.rows;
  const prevCols = process.stdout.columns;
  Object.defineProperty(process.stdout, 'rows', { value: next.rows, configurable: true });
  Object.defineProperty(process.stdout, 'columns', { value: next.columns, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process.stdout, 'rows', { value: prevRows, configurable: true });
    Object.defineProperty(process.stdout, 'columns', { value: prevCols, configurable: true });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

function captureWrites(fn: () => void): string {
  let out = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out += String(chunk);
    return true;
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return out;
}

describe('geometry', () => {
  it('reports the terminal size', () => {
    withGeometry({ rows: 40, columns: 120 }, () => {
      expect(rows()).toBe(40);
      expect(cols()).toBe(120);
    });
  });

  it('falls back to 24x80 when stdout has no size (not a TTY)', () => {
    withGeometry({ rows: undefined, columns: undefined }, () => {
      expect(rows()).toBe(24);
      expect(cols()).toBe(80);
    });
  });

  it('falls back rather than returning a zero size', () => {
    withGeometry({ rows: 0, columns: 0 }, () => {
      expect(rows()).toBe(24);
      expect(cols()).toBe(80);
    });
  });
});

describe('sequences', () => {
  it('builds DECSTBM for the given region', () => {
    expect(setScrollRegionSequence(1, 22)).toBe(`${ESC}1;22r`);
  });

  it('builds a region reset with no parameters', () => {
    expect(resetScrollRegionSequence()).toBe(`${ESC}r`);
  });

  it('builds absolute cursor addressing as row;col', () => {
    expect(moveToSequence(20, 3)).toBe(`${ESC}20;3H`);
  });

  it('erases the whole line, not just to the end', () => {
    expect(clearLineSequence()).toBe(`${ESC}2K`);
  });

  it('builds cursor save/restore', () => {
    expect(saveCursorSequence()).toBe(`${ESC}s`);
    expect(restoreCursorSequence()).toBe(`${ESC}u`);
  });
});

describe('writing forms', () => {
  it('setScrollRegion writes what setScrollRegionSequence builds', () => {
    expect(captureWrites(() => setScrollRegion(1, 19))).toBe(setScrollRegionSequence(1, 19));
  });

  it('resetScrollRegion writes what resetScrollRegionSequence builds', () => {
    expect(captureWrites(() => resetScrollRegion())).toBe(resetScrollRegionSequence());
  });

  it('moveTo writes what moveToSequence builds', () => {
    expect(captureWrites(() => moveTo(5, 1))).toBe(moveToSequence(5, 1));
  });
});
