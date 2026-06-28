import { describe, expect, it } from 'vitest';
import {
  buildEvalPickerScreen,
  buildEvalDetailScreen,
} from '../../src/cli/eval-screen.js';
import type { EvalHistoryEntry, EvalCheckResult } from '../../src/eval/history.js';
import type { CustomEval } from '../../src/eval/custom.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function makeEntry(over: Partial<EvalHistoryEntry> = {}): EvalHistoryEntry {
  return {
    timestamp: '2026-01-01T00:00:00Z',
    scenarioId: 'my-eval',
    model: 'test:model',
    pass: true,
    tokens: { total: 0 },
    ...over,
  };
}

describe('buildEvalPickerScreen', () => {
  const scenarios: CustomEval[] = [
    { id: 'alpha', firstLine: 'First scenario' },
    { id: 'beta', firstLine: 'Second scenario' },
  ];
  const hashes = new Map<string, { runHash: string; fullHash: string }>();

  it('returns an array of strings', () => {
    const lines = buildEvalPickerScreen(scenarios, 0, [], 'test:model', hashes);
    expect(Array.isArray(lines)).toBe(true);
    lines.forEach(l => expect(typeof l).toBe('string'));
  });

  it('contains each scenario id', () => {
    const lines = buildEvalPickerScreen(scenarios, 0, [], 'test:model', hashes);
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('alpha');
    expect(text).toContain('beta');
  });

  it('works with no scenarios', () => {
    const lines = buildEvalPickerScreen([], 0, [], 'test:model', hashes);
    expect(Array.isArray(lines)).toBe(true);
  });
});

describe('buildEvalDetailScreen', () => {
  const scenario: CustomEval = { id: 'my-eval', firstLine: 'Do something' };

  it('shows no-results message when entry is null', () => {
    const lines = buildEvalDetailScreen(scenario, null, 'test:model');
    expect(stripAnsi(lines.join('\n'))).toContain('No results');
  });

  it('shows PASS for a passing entry without checks', () => {
    const lines = buildEvalDetailScreen(scenario, makeEntry({ pass: true }), 'test:model');
    expect(stripAnsi(lines.join('\n'))).toContain('PASS');
  });

  it('shows FAIL for a failing entry without checks', () => {
    const lines = buildEvalDetailScreen(scenario, makeEntry({ pass: false }), 'test:model');
    expect(stripAnsi(lines.join('\n'))).toContain('FAIL');
  });

  it('renders assertion names from checks', () => {
    const checks: EvalCheckResult[] = [
      { name: 'file exists', kind: 'assertion', pass: true },
      { name: 'output matches', kind: 'assertion', pass: false, message: 'got foo, want bar' },
    ];
    const lines = buildEvalDetailScreen(scenario, makeEntry({ checks }), 'test:model');
    const text = stripAnsi(lines.join('\n'));
    expect(text).toContain('file exists');
    expect(text).toContain('output matches');
  });

  it('renders failure message for failed assertions', () => {
    const checks: EvalCheckResult[] = [
      { name: 'check', kind: 'assertion', pass: false, message: 'expected foo, got bar' },
    ];
    const lines = buildEvalDetailScreen(scenario, makeEntry({ checks }), 'test:model');
    expect(stripAnsi(lines.join('\n'))).toContain('expected foo, got bar');
  });

  it('renders stats section when stat checks are present', () => {
    const checks: EvalCheckResult[] = [
      { name: 'tokens', kind: 'stat', pass: true, note: '1234' },
    ];
    const lines = buildEvalDetailScreen(scenario, makeEntry({ checks }), 'test:model');
    expect(stripAnsi(lines.join('\n'))).toContain('tokens');
  });

  it('renders warnings section for fired warnings', () => {
    const checks: EvalCheckResult[] = [
      { name: 'slow response', kind: 'warning', pass: false, message: 'took 10s' },
    ];
    const lines = buildEvalDetailScreen(scenario, makeEntry({ checks }), 'test:model');
    expect(stripAnsi(lines.join('\n'))).toContain('took 10s');
  });
});
