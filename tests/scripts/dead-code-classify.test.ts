// check-tests: orphan — covers scripts/diagnostics/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { classify } from '../../scripts/diagnostics/dead-code-classify.js';

// The recovery machinery is shared with map-drift and regression-tested in
// tests/scripts/drift-classify.test.ts. What is tested here is the binding:
// that `DEAD` anchors, that the phrasings a model reaches for when it means
// "nothing to delete" read as clean, and — most importantly — that a finding is
// never silently laundered into a pass.

describe('classify — dead-code verdicts', () => {
  const okShapes: Array<[name: string, text: string]> = [
    ['bare OK', 'OK'],
    ['fenced', '```\nOK\n```'],
    ['labelled', 'Verdict: OK'],
    ['negated token', 'No dead code'],
    ['negated token, elaborated', 'No dead code found in this file.'],
    ['no findings', 'No findings'],
    ['no issues', 'No issues.'],
    ['nothing unreachable', 'No unreachable branches'],
    ['nothing unused', 'No unused exports'],
    ['nothing stale', 'No stale comments'],
    ['think block then verdict', '<think>Every export has a caller.</think>\nOK'],
  ];

  it.each(okShapes)('reads %s as ok', (_name, text) => {
    expect(classify(text).verdict).toBe('ok');
  });

  const deadShapes: Array<[name: string, text: string]> = [
    ['bare DEAD', 'DEAD\n- [unexport] `foo` — no code reference outside this file'],
    ['fenced', '```\nDEAD\n- [dead] `bar` — nothing imports it\n```'],
    ['labelled', 'Verdict: DEAD\n- [stale] comment on line 4 names a removed flag'],
    ['preamble first', 'Here is my audit:\n\nDEAD\n- [dead] `bar` — unreachable branch'],
  ];

  it.each(deadShapes)('reads %s as dead', (_name, text) => {
    expect(classify(text).verdict).toBe('dead');
  });

  // The trap the shared parser exists to avoid: a clean-sounding opener followed
  // by a real finding must not resolve clean. Ties break toward reporting.
  it('prefers a later finding over an earlier negation', () => {
    const text = 'No unused exports at first glance.\nDEAD\n- [dead] `helper` — never called';
    expect(classify(text).verdict).toBe('dead');
  });

  it('keeps the bullets as detail', () => {
    const result = classify('DEAD\n- [unexport] `foo` — used only in this file\n- [stale] line 9 names a deleted file');
    expect(result.detail).toBe('- [unexport] `foo` — used only in this file\n- [stale] line 9 names a deleted file');
  });

  it('takes detail written on the verdict line itself', () => {
    expect(classify('DEAD: `foo` is never imported').detail).toBe('`foo` is never imported');
  });

  // A verdict nobody can read is a result about the model, not a pass. Coercing
  // it to ok would under-report exactly what the sweep is looking for.
  it('never coerces an unreadable answer to ok', () => {
    expect(classify('I would need to see the other files.').verdict).toBe('unparsed');
    expect(classify('').verdict).toBe('unparsed');
  });

  it('preserves the raw text of an unparsed answer', () => {
    expect(classify('Maybe?').detail).toBe('Maybe?');
  });

  it('flags a verdict that only parsed after unwrapping', () => {
    expect(classify('OK').recovered).toBe(false);
    expect(classify('```\nOK\n```').recovered).toBe(true);
  });
});
