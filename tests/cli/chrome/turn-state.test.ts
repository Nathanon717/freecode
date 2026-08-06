import { beforeEach, describe, expect, it } from 'vitest';
import {
  setTurnActive,
  isTurnActive,
  composeThinkingLabel,
} from '../../../src/cli/chrome/turn-state.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

beforeEach(() => {
  setTurnActive(false);
});

describe('setTurnActive / isTurnActive', () => {
  it('defaults to inactive', () => {
    expect(isTurnActive()).toBe(false);
  });

  it('round-trips both ways', () => {
    setTurnActive(true);
    expect(isTurnActive()).toBe(true);
    setTurnActive(false);
    expect(isTurnActive()).toBe(false);
  });

  it('is idempotent — a second set does not toggle', () => {
    setTurnActive(true);
    setTurnActive(true);
    expect(isTurnActive()).toBe(true);
  });
});

describe('composeThinkingLabel', () => {
  it('reads "thinking..." flush left, aligning with the toggle bar\'s "ctrl+ "', () => {
    expect(stripAnsi(composeThinkingLabel())).toBe('thinking...');
  });

  it('does not depend on the turn flag — bottom-ui.ts decides when to draw it', () => {
    const whileIdle = composeThinkingLabel();
    setTurnActive(true);
    expect(composeThinkingLabel()).toBe(whileIdle);
  });
});
