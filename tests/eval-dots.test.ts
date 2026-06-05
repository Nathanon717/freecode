import { describe, expect, it } from 'vitest';
import {
  modelSlug,
  getEquivalentModels,
  getEvalStatus,
  getLatestEvalEntry,
  type EvalHistoryEntry,
} from '../src/cli/eval-dots.js';
import type { CanonicalModelGroups } from '../src/providers/canonical-models.js';

const GROUPS: CanonicalModelGroups = {
  'GPT-4o': ['openai:gpt-4o', 'azure:gpt-4o'],
};

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

describe('getEquivalentModels', () => {
  it('returns canonical group members for a grouped model', () => {
    const set = getEquivalentModels('openai:gpt-4o', GROUPS);
    expect(set.has('openai:gpt-4o')).toBe(true);
    expect(set.has('azure:gpt-4o')).toBe(true);
  });

  it('returns just the model when it is not grouped', () => {
    expect([...getEquivalentModels('groq:llama', GROUPS)]).toEqual(['groq:llama']);
  });

  it('defaults to "default" for an empty model string', () => {
    expect([...getEquivalentModels('', GROUPS)]).toEqual(['default']);
  });
});

describe('getEvalStatus', () => {
  it('is grey when there is no matching history', () => {
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', [], GROUPS)).toBe('grey');
  });

  it('is green for a passing run with no warnings', () => {
    const history = [entry({ pass: true })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS)).toBe('green');
  });

  it('is orange for a passing run with warnings', () => {
    const history = [entry({ pass: true, warnings: true })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS)).toBe('orange');
  });

  it('is red for a failing run', () => {
    const history = [entry({ pass: false })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS)).toBe('red');
  });

  it('uses the latest entry by timestamp', () => {
    const history = [
      entry({ pass: false, timestamp: '2026-01-01T00:00:00Z' }),
      entry({ pass: true, timestamp: '2026-02-01T00:00:00Z' }),
    ];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS)).toBe('green');
  });

  it('treats a canonically equivalent model as a match', () => {
    const history = [entry({ model: 'azure:gpt-4o', pass: true })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS)).toBe('green');
  });

  it('ignores entries whose hash does not match', () => {
    const history = [entry({ scenarioHash: 'stale-hash' })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS)).toBe('grey');
  });

  it('matches a legacy full hash for grandfathered entries', () => {
    const history = [entry({ scenarioHash: 'legacy-full-hash' })];
    expect(getEvalStatus('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS, 'legacy-full-hash')).toBe('green');
  });
});

describe('getLatestEvalEntry', () => {
  it('returns null when nothing matches', () => {
    expect(getLatestEvalEntry('001-demo', 'run-hash', 'openai:gpt-4o', [], GROUPS)).toBeNull();
  });

  it('returns the most recent matching entry', () => {
    const newest = entry({ timestamp: '2026-03-01T00:00:00Z', tokens: { total: 99 } });
    const history = [entry({ timestamp: '2026-01-01T00:00:00Z' }), newest];
    expect(getLatestEvalEntry('001-demo', 'run-hash', 'openai:gpt-4o', history, GROUPS)).toBe(newest);
  });
});
