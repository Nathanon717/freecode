import { describe, expect, it } from 'vitest';
import { statusCircle, buildEvalDots } from '../../src/cli/eval-dots.js';
import type { EvalDotsData } from '../../src/eval/history.js';
import type { PlaygroundScenario } from '../../src/eval/playground.js';

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('statusCircle', () => {
  it('returns a colored circle for each status', () => {
    expect(stripAnsi(statusCircle('green'))).toBe('●');
    expect(stripAnsi(statusCircle('red'))).toBe('●');
    expect(stripAnsi(statusCircle('orange'))).toBe('●');
    expect(stripAnsi(statusCircle('grey'))).toBe('●');
  });
});

describe('buildEvalDots', () => {
  it('returns one circle per scenario', () => {
    const scenarios: PlaygroundScenario[] = [
      { id: 's1', firstLine: 'first' },
      { id: 's2', firstLine: 'second' },
    ];
    const data: EvalDotsData = {
      scenarios,
      hashes: new Map([
        ['s1', { runHash: 'rh1', fullHash: 'fh1' }],
        ['s2', { runHash: 'rh2', fullHash: 'fh2' }],
      ]),
      history: [],
    };
    const dots = buildEvalDots('openai:gpt-4o', data);
    expect(stripAnsi(dots)).toBe('●●');
  });
});
