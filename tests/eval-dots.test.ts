import { describe, expect, it } from 'vitest';
import {
  modelSlug,
  getEvalStatus,
  getLatestEvalEntry,
  type EvalHistoryEntry,
} from '../src/cli/eval-dots.js';

function entry(over: Partial<EvalHistoryEntry>): EvalHistoryEntry {
  return {
    timestamp: '2026-01-01T00:00:00Z',
    scenarioId: '001-demo',
    model: 'openai:gpt-4o',
    pass: true,
    tokens: { total: 0 },
    scenarioHash: 'run-hash',
    ...over,
  };
}

describe('modelSlug', () => {
  it('replaces colons and slashes with double dashes', () => {
    expect(modelSlug('openai:gpt-4o')).toBe('openai--gpt-4o');
    expect(modelSlug('zen:deepseek/v4-flash')).toBe('zen--deepseek--v4-flash');
  });
});

describe('getEvalStatus', () => {
  it('is grey when there is no matching history', () => {
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', [])).toBe('grey');
  });

  it('is green for a passing run with no warnings', () => {
    const history = [entry({ pass: true })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history)).toBe('green');
  });

  it('is orange for a passing run with warnings', () => {
    const history = [entry({ pass: true, warnings: true })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history)).toBe('orange');
  });

  it('is red for a failing run', () => {
    const history = [entry({ pass: false })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history)).toBe('red');
  });

  it('uses the latest entry by timestamp', () => {
    const history = [
      entry({ pass: false, timestamp: '2026-01-01T00:00:00Z' }),
      entry({ pass: true, timestamp: '2026-02-01T00:00:00Z' }),
    ];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history)).toBe('green');
  });

  it('ignores entries whose hash does not match', () => {
    const history = [entry({ scenarioHash: 'stale-hash' })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history)).toBe('grey');
  });

  it('matches a legacy full hash for grandfathered entries', () => {
    const history = [entry({ scenarioHash: 'legacy-full-hash' })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, 'legacy-full-hash')).toBe('green');
  });
});

describe('getLatestEvalEntry', () => {
  it('returns null when nothing matches', () => {
    expect(getLatestEvalEntry('001-demo', 'run-hash', 'openai:gpt-4o', [])).toBeNull();
  });

  it('returns the most recent matching entry', () => {
    const newest = entry({ timestamp: '2026-03-01T00:00:00Z', tokens: { total: 99 } });
    const history = [entry({ timestamp: '2026-01-01T00:00:00Z' }), newest];
    expect(getLatestEvalEntry('001-demo', 'run-hash', 'openai:gpt-4o', history)).toBe(newest);
  });
});
