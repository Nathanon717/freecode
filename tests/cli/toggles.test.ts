import { beforeEach, describe, expect, it } from 'vitest';
import {
  initAskMode,
  getAskMode,
  isReadOnly,
  cycleByChar,
  composeToggleBar,
  toggleBarWidth,
} from '../../src/cli/toggles.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

// Reset ask toggle to 'ask' before each test.
// Read toggle has no direct setter — tests verify relative behavior.
beforeEach(() => {
  initAskMode('ask');
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
  it('returns a non-empty string', () => {
    expect(composeToggleBar().length).toBeGreaterThan(0);
  });

  it('contains the ask toggle character', () => {
    expect(stripAnsi(composeToggleBar())).toContain('A');
  });

  it('contains the read toggle character', () => {
    expect(stripAnsi(composeToggleBar())).toContain('R');
  });
});
