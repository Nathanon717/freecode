import { beforeEach, describe, expect, it } from 'vitest';
import {
  initAskMode,
  getAskMode,
  isReadOnly,
  cycleByChar,
  composeToggleBar,
  toggleBarWidth,
  setCtrlHint,
} from '../../src/cli/toggles.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Reset to known state before each test.
beforeEach(() => {
  initAskMode('ask');
  setCtrlHint(false);
});

describe('initAskMode / getAskMode', () => {
  it('initialises to ask mode', () => {
    initAskMode('ask');
    expect(getAskMode()).toBe('ask');
  });

  it('initialises to auto mode', () => {
    initAskMode('auto');
    expect(getAskMode()).toBe('auto');
  });
});

describe('cycleByChar', () => {
  it('cycles ask toggle with "a"', () => {
    initAskMode('ask');
    cycleByChar('a');
    expect(getAskMode()).toBe('auto');
    cycleByChar('a');
    expect(getAskMode()).toBe('ask');
  });

  it('cycles ask toggle case-insensitively', () => {
    initAskMode('ask');
    cycleByChar('A');
    expect(getAskMode()).toBe('auto');
  });

  it('cycles read toggle with "r"', () => {
    const before = isReadOnly();
    cycleByChar('r');
    expect(isReadOnly()).toBe(!before);
    cycleByChar('r'); // restore
    expect(isReadOnly()).toBe(before);
  });

  it('returns true for a known toggle character', () => {
    expect(cycleByChar('a')).toBe(true);
    cycleByChar('a'); // restore
  });

  it('returns false for an unknown character', () => {
    expect(cycleByChar('z')).toBe(false);
  });
});

describe('toggleBarWidth', () => {
  it('returns the visible character count of the toggle bar', () => {
    expect(typeof toggleBarWidth()).toBe('number');
    expect(toggleBarWidth()).toBeGreaterThan(0);
  });

  it('matches the stripped length of composeToggleBar', () => {
    const bar = stripAnsi(composeToggleBar());
    expect(bar.length).toBe(toggleBarWidth());
  });
});

describe('composeToggleBar', () => {
  it('compact mode: shows only toggle chars, no label rest', () => {
    setCtrlHint(false);
    const text = stripAnsi(composeToggleBar());
    expect(text).toContain('A');
    expect(text).toContain('R');
    // label rests ('sk', 'ead') must not appear in compact mode
    expect(text).not.toContain('sk');
    expect(text).not.toContain('ead');
  });

  it('hint mode: shows full label words (char + rest)', () => {
    setCtrlHint(true);
    const text = stripAnsi(composeToggleBar());
    expect(text).toContain('Ask');
    expect(text).toContain('Read');
  });

  it('hint mode: width matches stripped length', () => {
    setCtrlHint(true);
    const bar = stripAnsi(composeToggleBar());
    expect(bar.length).toBe(toggleBarWidth());
  });

  it('hint mode on: rest of word has no background (bg escape only around char)', () => {
    // Ask toggle starts at index 0 (on), Read at index 1 (off).
    setCtrlHint(true);
    const raw = composeToggleBar();
    // Find 'sk' in the raw ANSI string — it must not be preceded by a bg-color escape
    const bgEscapePattern = /\x1b\[48;2;[\d;]+m/g;
    const bgMatches = [...raw.matchAll(bgEscapePattern)].map(m => m.index ?? 0);
    // After each bg escape, extract the immediately following visible chars
    for (const idx of bgMatches) {
      // Strip ANSI after the bg escape to find the first visible chars
      const afterBg = raw.slice(idx).replace(/\x1b\[[0-9;]*m/g, '');
      // Only the single toggle char (1 char) should follow before grey rest
      expect(afterBg[0]).toMatch(/[A-Z]/);
      // 'sk' and 'ead' should NOT start immediately at position 0 of afterBg
      expect(afterBg).not.toMatch(/^sk/);
      expect(afterBg).not.toMatch(/^ead/);
    }
  });
});
