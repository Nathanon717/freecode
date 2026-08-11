import { describe, expect, it } from 'vitest';
import { validateCliArgs } from '../../src/cli/args.js';

describe('validateCliArgs', () => {
  it('accepts the documented invocations, in either flag order', () => {
    expect(validateCliArgs([])).toBeNull();
    expect(validateCliArgs(['-p', 'what does this repo do'])).toBeNull();
    expect(validateCliArgs(['-p', 'ask', '--stats', '--edit'])).toBeNull();
    expect(validateCliArgs(['--stats', '--model', 'zen:big-pickle', '-p', 'ask'])).toBeNull();
    expect(validateCliArgs(['--script', 'input.txt', '-log'])).toBeNull();
  });

  // The reported command. Whichever check fires first, it must not be "none of them".
  it('rejects `-p --stats -m X "prompt"` instead of running on the prompt "--stats"', () => {
    const error = validateCliArgs(['-p', '--stats', '-m', 'zen:big-pickle', 'what does this repo do']);
    expect(error).toContain('-p requires a prompt argument');
    expect(error).toContain('--stats');
  });

  it('names the flag sitting in a value slot, and shows where the value goes', () => {
    expect(validateCliArgs(['-p', '--edit', 'ask'])).toBe(
      '-p requires a prompt argument, but the next argument is the flag --edit. Put the value directly after -p: freecode -p "<prompt>" --edit',
    );
    expect(validateCliArgs(['--model', '--stats'])).toContain('--model requires a provider:model argument');
  });

  it('rejects on the flag table, not on a leading dash, so a dash-leading prompt survives', () => {
    expect(validateCliArgs(['-p', '--stats is what? explain', '--stats'])).toBeNull();
    expect(validateCliArgs(['-p', '-4 vs -8, which?'])).toBeNull();
  });

  it('names an unknown flag rather than dropping it', () => {
    const error = validateCliArgs(['-p', 'ask', '-m', 'zen:big-pickle']);
    expect(error).toContain('Unknown flag: -m');
    expect(error).toContain('--model');
  });

  it('names a bare argument no flag claimed', () => {
    const error = validateCliArgs(['-p', 'ask', 'and also this']);
    expect(error).toContain('Unexpected argument: "and also this"');
    expect(error).toContain('freecode -p "<prompt>"');
  });

  it('reports a missing value with the flag\'s own message', () => {
    expect(validateCliArgs(['-p'])).toBe('-p requires a prompt argument');
    expect(validateCliArgs(['--model'])).toBe('--model requires a provider:model argument');
    expect(validateCliArgs(['--script'])).toBe('--script requires a file path argument');
  });
});
