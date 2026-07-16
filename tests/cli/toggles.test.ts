import { beforeEach, describe, expect, it } from 'vitest';
import chalk from 'chalk';
import {
  initAskMode,
  getAskMode,
  isReadOnly,
  cycleByChar,
  composeToggleBar,
  toggleBarWidth,
  areToggleNamesShown,
} from '../../src/cli/toggles.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const setShowNames = (on: boolean) => {
  if (areToggleNamesShown() !== on) cycleByChar('s');
};

// Reset to known state before each test.
beforeEach(() => {
  initAskMode('ask');
  setShowNames(false);
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

  it('cycles the show-names toggle with "s"', () => {
    setShowNames(false);
    cycleByChar('s');
    expect(areToggleNamesShown()).toBe(true);
    cycleByChar('s');
    expect(areToggleNamesShown()).toBe(false);
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
  it('names off: shows only toggle chars, single-space separated', () => {
    setShowNames(false);
    const text = stripAnsi(composeToggleBar());
    expect(text).toBe('ctrl+ S A R');
  });

  it('names on: shows full label words (char + rest)', () => {
    setShowNames(true);
    const text = stripAnsi(composeToggleBar());
    expect(text).toBe('ctrl+ Show toggle names Auto-run tools Read-only');
  });

  it('names on: width matches stripped length', () => {
    setShowNames(true);
    const bar = stripAnsi(composeToggleBar());
    expect(bar.length).toBe(toggleBarWidth());
  });

  it('names on: only the toggle char is highlighted, not its label rest', () => {
    // chalk emits no escapes unless colour support is forced on.
    const level = chalk.level;
    chalk.level = 3;
    setShowNames(true); // turns the S toggle on, so it renders with a background
    const raw = composeToggleBar();
    chalk.level = level;
    const bgEscapePattern = /\x1b\[48;2;[\d;]+m/g;
    const bgStarts = [...raw.matchAll(bgEscapePattern)].map(m => m.index ?? 0);
    expect(bgStarts.length).toBeGreaterThan(0);
    for (const start of bgStarts) {
      // Visible text between the bg escape and its reset must be the single char.
      const reset = raw.indexOf('\x1b[49m', start);
      expect(reset).toBeGreaterThan(start);
      const highlighted = stripAnsi(raw.slice(start, reset));
      expect(highlighted).toHaveLength(1);
      expect(highlighted).toMatch(/[A-Z]/);
    }
  });
});
