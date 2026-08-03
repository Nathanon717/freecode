// check-tests: orphan — covers scripts/sweep/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { countUnits, formatElapsed, summarize } from '../../scripts/sweep/report.js';
import type { SweepOutcome } from '../../scripts/sweep/types.js';

function outcome(verdict: string, finding: boolean, recovered = false): SweepOutcome<null> {
  return {
    unit: null,
    label: `unit-${verdict}`,
    verdict,
    finding,
    detail: '',
    recovered,
    durationMs: 0,
    startedAtMs: 0,
    requests: 1,
  };
}

describe('countUnits', () => {
  it('pluralizes everything but one', () => {
    expect(countUnits(0, 'pair')).toBe('0 pairs');
    expect(countUnits(1, 'pair')).toBe('1 pair');
    expect(countUnits(7, 'pair')).toBe('7 pairs');
  });
});

describe('formatElapsed', () => {
  it('uses seconds below a minute and m/ss above', () => {
    expect(formatElapsed(1500)).toBe('1.5s');
    expect(formatElapsed(59_900)).toBe('59.9s');
    expect(formatElapsed(123_000)).toBe('2m03s');
  });
});

describe('summarize', () => {
  it('always shows the primary verdict, even at zero', () => {
    const outcomes = [outcome('ok', false), outcome('ok', false)];
    expect(summarize(outcomes, 'pair', 'drift', 1000)).toBe('2 pairs · 2 ok · 0 drift · 1.0s');
  });

  it('counts every non-finding outcome as ok', () => {
    const outcomes = [outcome('ok', false), outcome('drift', true)];
    expect(summarize(outcomes, 'pair', 'drift', 1000)).toBe('2 pairs · 1 ok · 1 drift · 1.0s');
  });

  // Alphabetical after the primary, so two runs of the same sweep line up when diffed.
  it('lists other verdicts after the primary, in a stable order', () => {
    const outcomes = [
      outcome('ok', false),
      outcome('unparsed', true),
      outcome('error', true),
      outcome('drift', true),
    ];
    expect(summarize(outcomes, 'pair', 'drift', 1000))
      .toBe('4 pairs · 1 ok · 1 drift · 1 error · 1 unparsed · 1.0s');
  });

  it('reports recovered verdicts last, and only when some occurred', () => {
    const clean = [outcome('drift', true)];
    expect(summarize(clean, 'pair', 'drift', 1000)).toBe('1 pair · 0 ok · 1 drift · 1.0s');

    const recovered = [outcome('drift', true, true), outcome('ok', false, true)];
    expect(summarize(recovered, 'pair', 'drift', 1000))
      .toBe('2 pairs · 1 ok · 1 drift · 2 recovered · 1.0s');
  });

  it('carries the sweep own unit noun and primary verdict', () => {
    const outcomes = [outcome('stale', true), outcome('fresh', false)];
    expect(summarize(outcomes, 'file', 'stale', 2000)).toBe('2 files · 1 ok · 1 stale · 2.0s');
  });
});
