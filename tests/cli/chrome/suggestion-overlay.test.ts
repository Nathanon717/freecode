import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ScreenBufferModule from '../../../src/util/screen-buffer.js';
import {
  getOverlayRows,
  resetOverlay,
  captureOverlay,
  composeOverlayRestore,
} from '../../../src/cli/chrome/suggestion-overlay.js';

vi.mock('../../../src/util/screen-buffer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ScreenBufferModule>();
  return {
    ...actual,
    getScreenBufferDisplayLinesForOverlay: (n: number) =>
      Array.from({ length: n }, (_, i) => `line${i}`),
  };
});

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

beforeEach(() => {
  resetOverlay();
});

describe('captureOverlay / getOverlayRows', () => {
  it('reports no open overlay before a capture', () => {
    expect(getOverlayRows()).toBe(0);
  });

  it('reports the captured row count', () => {
    captureOverlay(3, 10, 20);
    expect(getOverlayRows()).toBe(3);
  });
});

describe('composeOverlayRestore', () => {
  it('returns an empty string when no overlay is open, so callers can concatenate blindly', () => {
    expect(composeOverlayRestore(80)).toBe('');
  });

  it('repaints the captured lines', () => {
    captureOverlay(2, 5, 20);
    expect(stripAnsi(composeOverlayRestore(80))).toContain('line0');
    expect(stripAnsi(composeOverlayRestore(80))).not.toContain('line0');
  });

  it('clears the snapshot as a side effect — there is no separate close call', () => {
    captureOverlay(2, 5, 20);
    composeOverlayRestore(80);
    expect(getOverlayRows()).toBe(0);
    expect(composeOverlayRestore(80)).toBe('');
  });

  it('truncates to the visible width, not the byte length', () => {
    captureOverlay(1, 5, 20);
    const restored = stripAnsi(composeOverlayRestore(3));
    expect(restored).toContain('lin');
    expect(restored).not.toContain('line0');
  });
});

describe('resetOverlay', () => {
  it('drops the snapshot without repainting, for resize where every row moved', () => {
    captureOverlay(3, 10, 20);
    resetOverlay();
    expect(getOverlayRows()).toBe(0);
    expect(composeOverlayRestore(80)).toBe('');
  });
});
