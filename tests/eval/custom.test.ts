import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import {
  modelSlug,
  discoverCustomEvals,
  computeRunHash,
  computeScenarioHash,
} from '../../src/eval/custom.js';

// ── modelSlug ─────────────────────────────────────────────────────────────────

describe('modelSlug', () => {
  it.each([
    ['openai:gpt-4o', 'openai--gpt-4o'],
    ['zen:deepseek/v4-flash', 'zen--deepseek--v4-flash'],
    ['plain', 'plain'],
  ])('%s → %s', (input, expected) => {
    expect(modelSlug(input)).toBe(expected);
  });
});

// ── discoverCustomEvals ───────────────────────────────────────────────────────
// Reads the committed evals/custom dir — asserts stable structural invariants,
// not specific names or counts.

describe('discoverCustomEvals', () => {
  it('returns a non-empty CustomEval[] with id and firstLine ≤ 80 chars', () => {
    const evals = discoverCustomEvals();
    expect(evals.length).toBeGreaterThan(0);
    for (const e of evals) {
      expect(typeof e.id).toBe('string');
      expect(e.firstLine.length).toBeLessThanOrEqual(80);
    }
  });

  it('excludes shared and results directories', () => {
    const ids = discoverCustomEvals().map(e => e.id);
    expect(ids).not.toContain('shared');
    expect(ids).not.toContain('results');
  });

  it('sorts non-numbered entries before numbered entries', () => {
    const ids = discoverCustomEvals().map(e => e.id);
    const nonNumbered = ids.filter(id => !/^\d{3}-/.test(id));
    const numbered = ids.filter(id => /^\d{3}-/.test(id));
    if (nonNumbered.length > 0 && numbered.length > 0) {
      const lastNonNumIdx = ids.indexOf(nonNumbered[nonNumbered.length - 1]);
      const firstNumIdx = ids.indexOf(numbered[0]);
      expect(lastNonNumIdx).toBeLessThan(firstNumIdx);
    }
  });
});

// ── computeRunHash / computeScenarioHash ──────────────────────────────────────

let tempDir: string;

function writeScenario(
  dir: string,
  opts: {
    prompt?: string;
    config?: string;
    startFiles?: Record<string, string>;
    evalFiles?: Record<string, string>;
  },
): void {
  mkdirSync(dir, { recursive: true });
  if (opts.prompt !== undefined) writeFileSync(join(dir, 'prompt.md'), opts.prompt);
  if (opts.config !== undefined) writeFileSync(join(dir, 'eval.config.json'), opts.config);
  for (const [name, content] of Object.entries(opts.startFiles ?? {})) {
    const p = join(dir, 'start', name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  for (const [name, content] of Object.entries(opts.evalFiles ?? {})) {
    const p = join(dir, 'eval', name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'freecode-custom-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('computeRunHash', () => {
  it('returns a sha256 hex string', () => {
    writeScenario(join(tempDir, 's'), { prompt: 'task' });
    expect(computeRunHash(join(tempDir, 's'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic: same content → same hash', () => {
    const [a, b] = ['a', 'b'].map(n => join(tempDir, n));
    const opts = { prompt: 'task', startFiles: { 'main.py': 'x=1' } };
    writeScenario(a, opts);
    writeScenario(b, opts);
    expect(computeRunHash(a)).toBe(computeRunHash(b));
  });

  it('changes when prompt.md changes', () => {
    const [a, b] = ['a', 'b'].map(n => join(tempDir, n));
    writeScenario(a, { prompt: 'task one' });
    writeScenario(b, { prompt: 'task two' });
    expect(computeRunHash(a)).not.toBe(computeRunHash(b));
  });

  it('does NOT change when eval/ files change', () => {
    const [a, b] = ['a', 'b'].map(n => join(tempDir, n));
    writeScenario(a, { prompt: 'task', evalFiles: { 'check.ts': 'v1' } });
    writeScenario(b, { prompt: 'task', evalFiles: { 'check.ts': 'v2' } });
    expect(computeRunHash(a)).toBe(computeRunHash(b));
  });

  it('normalises CRLF to LF before hashing', () => {
    const [a, b] = ['a', 'b'].map(n => join(tempDir, n));
    writeScenario(a, { prompt: 'line1\r\nline2' });
    writeScenario(b, { prompt: 'line1\nline2' });
    expect(computeRunHash(a)).toBe(computeRunHash(b));
  });

  it('still returns a hash when optional files are absent', () => {
    writeScenario(join(tempDir, 's'), { prompt: 'minimal' });
    expect(computeRunHash(join(tempDir, 's'))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('includes nested files from start/ subdirectories', () => {
    const [a, b] = ['a', 'b'].map(n => join(tempDir, n));
    writeScenario(a, { prompt: 'task', startFiles: { 'sub/deep.py': 'v1' } });
    writeScenario(b, { prompt: 'task', startFiles: { 'sub/deep.py': 'v2' } });
    expect(computeRunHash(a)).not.toBe(computeRunHash(b));
  });

  it('ignores .gitkeep files in start/', () => {
    const [a, b] = ['a', 'b'].map(n => join(tempDir, n));
    writeScenario(a, { prompt: 'task', startFiles: { 'code.py': 'x', '.gitkeep': '' } });
    writeScenario(b, { prompt: 'task', startFiles: { 'code.py': 'x' } });
    expect(computeRunHash(a)).toBe(computeRunHash(b));
  });

  it('agrees with computeScenarioHash when eval/ is absent', () => {
    writeScenario(join(tempDir, 's'), { prompt: 'task', startFiles: { 'a.py': 'x' } });
    expect(computeRunHash(join(tempDir, 's'))).toBe(computeScenarioHash(join(tempDir, 's')));
  });
});

describe('computeScenarioHash', () => {
  it('changes when eval/ files change', () => {
    const [a, b] = ['a', 'b'].map(n => join(tempDir, n));
    writeScenario(a, { prompt: 'task', evalFiles: { 'check.ts': 'v1' } });
    writeScenario(b, { prompt: 'task', evalFiles: { 'check.ts': 'v2' } });
    expect(computeScenarioHash(a)).not.toBe(computeScenarioHash(b));
  });

  it('differs from computeRunHash when eval/ is present', () => {
    writeScenario(join(tempDir, 's'), { prompt: 'task', evalFiles: { 'check.ts': 'code' } });
    const dir = join(tempDir, 's');
    expect(computeRunHash(dir)).not.toBe(computeScenarioHash(dir));
  });
});
