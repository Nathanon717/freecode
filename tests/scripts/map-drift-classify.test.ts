// check-tests: orphan — covers scripts/diagnostics/, which has no src/ mirror.
import { describe, it, expect } from 'vitest';
import { classify } from '../../scripts/diagnostics/map-drift-classify.js';

// Shapes marked "captured" are real responses taken from
// scripts/diagnostics/map-drift/mistral-mistral-medium-2508.md, which preserved
// raw text for every non-ok outcome. The rest are the traps that a naive
// "search for the token anywhere in the text" parser gets wrong.

describe('classify — verdict recovery', () => {
  const okShapes: Array<[name: string, text: string]> = [
    ['bare OK', 'OK'],
    ['captured: bare fence wrapper', '```\nOK\n```'],
    ['fence with language tag', '```markdown\nOK\n```'],
    ['fence with text tag', '```text\nOK\n```'],
    ['bold emphasis', '**OK**'],
    ['trailing colon', 'OK:'],
    ['lowercase', 'ok'],
    ['okay', 'Okay'],
    ['trailing prose on the verdict line', 'OK — the page still matches the code.'],
    ['preamble line before the verdict', 'Here is my audit:\n\nOK'],
    ['labelled', 'Verdict: OK'],
    ['json shape', '{"verdict": "OK"}'],
    ['blockquoted', '> OK'],
    ['negated drift', 'No drift'],
    ['negated drift, elaborated', 'No drift found.'],
    ['negated drift in a fence', '```\nNo drift detected\n```'],
    ['closed think block then verdict', '<think>The page says X, the code says X.</think>\nOK'],
  ];

  it.each(okShapes)('reads %s as ok', (_name, text) => {
    expect(classify(text).verdict).toBe('ok');
  });

  const driftShapes: Array<[name: string, text: string]> = [
    ['bare DRIFT', 'DRIFT\n- a -> b'],
    ['captured: fenced DRIFT with body', '```\nDRIFT\n- Resolves through `resolveProjectPath()` -> Resolves through `resolveExistingProjectPath()`\n```'],
    ['colon on the verdict line', 'DRIFT: - a -> b'],
    ['bold', '**DRIFT**\n- a -> b'],
    ['labelled', 'Verdict: DRIFT\n- a -> b'],
    ['preamble before the verdict', 'After comparing both files:\n\nDRIFT\n- a -> b'],
    ['hedge containing OK mid-sentence, then DRIFT', 'Looks OK at first glance, but:\nDRIFT\n- a -> b'],
    ['no-longer phrasing must not read as negation', 'DRIFT\n- No longer matches -> renamed'],
    // A leading negation is prose, not a verdict — a real DRIFT below it wins.
    ['negation sentence above the real verdict', 'Looking at the page.\nNo drift is apparent in the purpose statement.\nDRIFT\n- x -> y'],
    ['negation then labelled drift', 'No drift in the purpose line.\nVerdict: DRIFT\n- x -> y'],
  ];

  it.each(driftShapes)('reads %s as drift', (_name, text) => {
    expect(classify(text).verdict).toBe('drift');
  });

  const unparsedShapes: Array<[name: string, text: string]> = [
    ['empty', ''],
    ['whitespace only', '   \n  '],
    ['refusal', 'I cannot audit this file.'],
    ['hedge with no verdict token', 'Not sure — the page is terse but plausible.'],
    ['truncated inside an unclosed think block', '<think>Comparing the page to the code, I see that'],
  ];

  it.each(unparsedShapes)('leaves %s unparsed', (_name, text) => {
    expect(classify(text).verdict).toBe('unparsed');
  });

  it('never coerces an unrecognized response to ok', () => {
    // The failure this parser exists to prevent: a clean-by-default verdict
    // silently under-reports drift.
    for (const [, text] of unparsedShapes) {
      expect(classify(text).verdict).not.toBe('ok');
    }
  });
});

describe('classify — drift detail', () => {
  it('keeps the body and drops the closing fence', () => {
    const result = classify('```\nDRIFT\n- a -> b\n```');
    expect(result.detail).toBe('- a -> b');
  });

  it('slices from the verdict line, not line 1, so no bullet is lost', () => {
    const result = classify('After comparing both files:\n\nDRIFT\n- first -> x\n- second -> y');
    expect(result.detail).toBe('- first -> x\n- second -> y');
  });

  it('does not prepend model preamble into the finding', () => {
    const result = classify('Here is my analysis:\nDRIFT\n- a -> b');
    expect(result.detail).not.toContain('Here is my analysis');
  });

  it('captures detail written on the verdict line', () => {
    expect(classify('DRIFT: - a -> b').detail).toBe('- a -> b');
  });

  it('keeps multi-line bodies intact', () => {
    const body = '- The guard checks `del /f` -> code checks `\\bdel\\b/i`\n- The guard checks `ren / rename` -> code checks `\\bren(?:ame)?\\b/i`';
    expect(classify(`DRIFT\n${body}`).detail).toBe(body);
  });

  it('preserves raw text when a response cannot be parsed', () => {
    expect(classify('I cannot audit this file.').detail).toBe('I cannot audit this file.');
  });
});

describe('classify — recovered flag', () => {
  it('is false for a compliant answer', () => {
    expect(classify('OK').recovered).toBe(false);
    expect(classify('DRIFT\n- a -> b').recovered).toBe(false);
  });

  it('is true when a wrapper had to be stripped', () => {
    expect(classify('```\nOK\n```').recovered).toBe(true);
  });

  it('is true when the verdict was below the first line', () => {
    expect(classify('Here is my audit:\n\nOK').recovered).toBe(true);
  });
});
