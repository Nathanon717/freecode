import { beforeEach, describe, expect, it } from 'vitest';
import {
  setTurnActive,
  isTurnActive,
  composeThinkingLabel,
  setActivity,
  setActivityChangeListener,
  isActivityKind,
} from '../../../src/cli/chrome/turn-state.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const label = () => stripAnsi(composeThinkingLabel());

beforeEach(() => {
  setActivityChangeListener(null);
  setActivity(null);
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

describe('activity verbs', () => {
  it('overrides the base label for each of the three slow tools', () => {
    setActivity('grep');
    expect(label()).toBe('grepping...');
    setActivity('shell_exec');
    expect(label()).toBe('shelling...');
    setActivity('spawn_agent');
    expect(label()).toBe('delegating...');
  });

  it('falls back to "thinking..." once the tool clears', () => {
    setActivity('grep');
    setActivity(null);
    expect(label()).toBe('thinking...');
  });

  it('recognises only the tools that get a verb', () => {
    expect(isActivityKind('grep')).toBe(true);
    expect(isActivityKind('shell_exec')).toBe(true);
    expect(isActivityKind('spawn_agent')).toBe(true);
    // Fast tools deliberately have none — a verb that flickers reads worse
    // than not naming the tool at all.
    for (const fast of ['read', 'edit', 'create', 'list_dir']) {
      expect(isActivityKind(fast)).toBe(false);
    }
  });

  it('notifies the listener on change, so the label row repaints', () => {
    let calls = 0;
    setActivityChangeListener(() => calls++);
    setActivity('grep');
    expect(calls).toBe(1);
    setActivity(null);
    expect(calls).toBe(2);
  });

  it('does not notify when the verb is unchanged — no redundant paints', () => {
    let calls = 0;
    setActivityChangeListener(() => calls++);
    setActivity('grep');
    setActivity('grep');
    expect(calls).toBe(1);
  });

  it('ending the turn clears a stranded verb, and does so silently', () => {
    let calls = 0;
    setActivity('shell_exec');
    setActivityChangeListener(() => calls++);
    setTurnActive(false);
    // The label's row is dropped by the turn ending anyway, so firing here
    // would only add a paint.
    expect(calls).toBe(0);
    expect(label()).toBe('thinking...');
  });
});
