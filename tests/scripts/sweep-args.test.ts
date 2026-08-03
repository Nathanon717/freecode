// check-tests: orphan — covers scripts/sweep/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { parseSweepArgs, sanitize } from '../../scripts/sweep/args.js';

const defaults = { outDir: '/out' };

describe('parseSweepArgs', () => {
  it('applies defaults when given nothing', () => {
    expect(parseSweepArgs([], defaults)).toEqual({
      model: undefined,
      only: undefined,
      limit: undefined,
      concurrency: 8,
      outDir: '/out',
      dryRun: false,
    });
  });

  it('reads every flag', () => {
    const options = parseSweepArgs(
      ['--model', 'zen:big-pickle', '--only', 'agent/', '--limit', '5', '--concurrency', '2', '--out', '/tmp/x', '--dry-run'],
      defaults,
    );
    expect(options).toEqual({
      model: 'zen:big-pickle',
      only: 'agent/',
      limit: 5,
      concurrency: 2,
      outDir: '/tmp/x',
      dryRun: true,
    });
  });

  it('honours a caller-supplied concurrency default', () => {
    expect(parseSweepArgs([], { outDir: '/out', concurrency: 3 }).concurrency).toBe(3);
  });

  // A sweep is a long spending run, so a mistyped flag must stop it rather than
  // silently fall back to a default and waste the whole sweep.
  it('rejects an unknown flag', () => {
    expect(() => parseSweepArgs(['--models', 'a:b'], defaults)).toThrow('Unknown argument: --models');
  });

  it('rejects a flag missing its value', () => {
    expect(() => parseSweepArgs(['--model'], defaults)).toThrow('--model requires a value');
  });

  it('rejects a second --model instead of taking the last', () => {
    expect(() => parseSweepArgs(['--model', 'a:b', '--model', 'c:d'], defaults))
      .toThrow('--model may only be given once');
  });

  it.each([
    ['--limit', 'abc'],
    ['--limit', '0'],
    ['--limit', '-1'],
    ['--limit', '1.5'],
    ['--concurrency', 'many'],
    ['--concurrency', '0'],
  ])('rejects %s %s', (flag, value) => {
    expect(() => parseSweepArgs([flag, value], defaults)).toThrow(`${flag} requires a positive integer`);
  });
});

describe('sanitize', () => {
  it('makes a model preference safe as a filename stem', () => {
    expect(sanitize('zen:big-pickle')).toBe('zen-big-pickle');
    expect(sanitize('mistral:mistral-medium-2508')).toBe('mistral-mistral-medium-2508');
  });

  it('collapses a run of unsafe characters into one dash', () => {
    expect(sanitize('a::/b')).toBe('a-b');
  });
});
