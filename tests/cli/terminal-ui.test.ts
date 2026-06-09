import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  composeBottomRightStatus,
  composeBottomStatusLine,
  cursorToVisualPos,
  getInlineCompletionSuffix,
  setModelStatus,
  setOpenAIDailySpend,
  setPreflightInputCost,
  setQuotaSnapshot,
  setTokenCount,
  visualRowsForLine,
} from '../../src/cli/terminal-ui.js';

describe('bottom pinned status section', () => {
  afterEach(() => {
    vi.useRealTimers();
    setModelStatus('', '');
    setOpenAIDailySpend({ state: 'idle', updatedAt: 0 });
    setQuotaSnapshot(null);
    setPreflightInputCost({ state: 'idle', providerId: '', modelId: '', updatedAt: 0 });
    setTokenCount(0);
  });

  it('right-aligns quota status and current context token count', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setQuotaSnapshot([
      { label: 'R', remaining: 974, limit: 1000, resetMs: 2_205_000 },
      { label: 'T', remaining: 12000, limit: 12000, resetMs: 0 },
    ]);
    setTokenCount(123);

    expect(composeBottomStatusLine(123, now.getTime())).toBe(
      '                                                             R  974/1000 full 36m45s | T 12000/12000 full 0s     | 123 ctx'
    );
  });

  it('keeps model and token count visible when quota status is too wide', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setModelStatus('groq', 'llama-3.3-70b-versatile');
    setQuotaSnapshot([
      { label: 'R', remaining: 985, limit: 1000, resetMs: 1_287_000 },
      { label: 'T', remaining: 12000, limit: 12000, resetMs: 0 },
    ]);
    setTokenCount(123);

    const status = composeBottomRightStatus(62, now.getTime());

    expect(status).toContain('groq:llama-3.3-70b-versatile');
    expect(status).toContain('123 ctx');
    expect(status).not.toContain('R  985/1000');
    expect(status.length).toBeLessThanOrEqual(62);
  });

  it('keeps fixed footer labels in the same columns as quota values change width', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setQuotaSnapshot([
      { label: 'R', remaining: 9, limit: 1000, resetMs: 2_000 },
      { label: 'T', remaining: 89, limit: 12000, resetMs: 0 },
    ]);
    setTokenCount(7);
    const lowValues = composeBottomRightStatus(80, now.getTime());

    setQuotaSnapshot([
      { label: 'R', remaining: 986, limit: 1000, resetMs: 1_188_000 },
      { label: 'T', remaining: 12000, limit: 12000, resetMs: 0 },
    ]);
    setTokenCount(289);
    const highValues = composeBottomRightStatus(80, now.getTime());

    for (const label of ['/1000 full', '| T', '/12000 full', '|']) {
      expect(highValues.indexOf(label)).toBe(lowValues.indexOf(label));
    }
    // ctx position is not fixed-width since token count has no upper bound to align against
  });

  it('renders OpenAI preflight input tokens and input cost when available', () => {
    setTokenCount(123);
    setPreflightInputCost({
      state: 'ready',
      providerId: 'openai',
      modelId: 'gpt-5',
      inputTokens: 12431,
      inputUsd: 0.0186,
      formattedInputUsd: '$0.0186',
      payloadHash: 'abc',
      updatedAt: Date.now(),
    });

    const status = composeBottomRightStatus(80);

    expect(status).toContain('12,431 in tok | $0.0186 input');
    expect(status).toContain('123 ctx');
    expect(status.length).toBeLessThanOrEqual(80);
  });

  it('renders OpenAI daily spend when available', () => {
    setTokenCount(123);
    setOpenAIDailySpend({
      state: 'ready',
      amountUsd: 1.23,
      formattedAmountUsd: '$1.23',
      updatedAt: Date.now(),
    });

    const status = composeBottomRightStatus(80);

    expect(status).toContain('OpenAI today $1.23');
    expect(status).toContain('123 ctx');
  });

  it('renders OpenAI daily spend missing-key and failure states', () => {
    setTokenCount(123);
    setOpenAIDailySpend({
      state: 'idle',
      warning: 'OPENAI_ADMIN_KEY missing',
      updatedAt: Date.now(),
    });
    expect(composeBottomRightStatus(80)).toContain('OpenAI spend off: OPENAI_ADMIN_KEY missing');

    setOpenAIDailySpend({
      state: 'unavailable',
      warning: 'OpenAI costs HTTP 401',
      updatedAt: Date.now(),
    });
    expect(composeBottomRightStatus(80)).toContain('OpenAI spend failed: OpenAI costs HTTP 401');
  });

  it('drops OpenAI daily spend before dropping model', () => {
    setModelStatus('openai', 'gpt-5.4-nano-2026-03-17');
    setTokenCount(123);
    setOpenAIDailySpend({
      state: 'ready',
      amountUsd: 1.23,
      formattedAmountUsd: '$1.23',
      updatedAt: Date.now(),
    });

    const status = composeBottomRightStatus(44);

    expect(status).toContain('openai:gpt-5.4-nano-2026-03-17');
    expect(status).not.toContain('OpenAI today $1.23');
    expect(status.length).toBeLessThanOrEqual(44);
  });

  it('renders pending and failed OpenAI preflight states loudly', () => {
    setTokenCount(123);
    setPreflightInputCost({
      state: 'pending',
      providerId: 'openai',
      modelId: 'gpt-5',
      updatedAt: Date.now(),
    });
    expect(composeBottomRightStatus(80)).toContain('input tok: counting');

    setPreflightInputCost({
      state: 'unavailable',
      providerId: 'openai',
      modelId: 'gpt-5',
      warning: 'HTTP 401',
      updatedAt: Date.now(),
    });
    expect(composeBottomRightStatus(80)).toContain('input tok failed: HTTP 401');

    setPreflightInputCost({
      state: 'idle',
      providerId: 'openai',
      modelId: 'gpt-5',
      warning: 'OPENAI_API_KEY missing',
      updatedAt: Date.now(),
    });
    expect(composeBottomRightStatus(80)).toContain('input tok off: OPENAI_API_KEY missing');
  });

  it('drops OpenAI preflight input cost before dropping model', () => {
    setModelStatus('openai', 'gpt-5.4-nano-2026-03-17');
    setTokenCount(123);
    setPreflightInputCost({
      state: 'ready',
      providerId: 'openai',
      modelId: 'gpt-5.4-nano-2026-03-17',
      inputTokens: 12431,
      inputUsd: 0.0186,
      formattedInputUsd: '$0.0186',
      payloadHash: 'abc',
      updatedAt: Date.now(),
    });

    const status = composeBottomRightStatus(62);

    expect(status).toContain('openai:gpt-5.4-nano-2026-03-17');
    expect(status).not.toContain('12,431 in tok | $0.0186 input');
    expect(status).toContain('123 ctx');
    expect(status.length).toBeLessThanOrEqual(62);
  });
});

describe('inline command completion', () => {
  it('returns only the ghost suffix after the typed input', () => {
    expect(getInlineCompletionSuffix('/e', '/eval')).toBe('val');
    expect(getInlineCompletionSuffix('/eval', '/eval')).toBe('');
    expect(getInlineCompletionSuffix('hello', null)).toBe('');
  });
});

describe('visual input wrapping', () => {
  // w=80 → effectiveWidth = 78 chars per row

  it('visualRowsForLine: empty line needs 1 row', () => {
    expect(visualRowsForLine('', 80)).toBe(1);
  });

  it('visualRowsForLine: line shorter than effective width needs 1 row', () => {
    expect(visualRowsForLine('hello', 80)).toBe(1);
  });

  it('visualRowsForLine: line exactly filling effective width opens a blank overflow row', () => {
    expect(visualRowsForLine('x'.repeat(78), 80)).toBe(2);
  });

  it('visualRowsForLine: line one char beyond effective width needs 2 rows', () => {
    expect(visualRowsForLine('x'.repeat(79), 80)).toBe(2);
  });

  it('visualRowsForLine: two full rows worth of text needs 3 rows', () => {
    expect(visualRowsForLine('x'.repeat(156), 80)).toBe(3);
  });

  it('cursorToVisualPos: empty buffer cursor is at row 0, col 0', () => {
    expect(cursorToVisualPos('', 0, 80)).toEqual({ visualRow: 0, visualCol: 0 });
  });

  it('cursorToVisualPos: cursor within first row stays on row 0', () => {
    expect(cursorToVisualPos('hello', 5, 80)).toEqual({ visualRow: 0, visualCol: 5 });
  });

  it('cursorToVisualPos: cursor at exact boundary (len=effW) lands on row 1, col 0', () => {
    const buf = 'x'.repeat(78);
    expect(cursorToVisualPos(buf, 78, 80)).toEqual({ visualRow: 1, visualCol: 0 });
  });

  it('cursorToVisualPos: cursor one char before boundary stays on row 0', () => {
    const buf = 'x'.repeat(77);
    expect(cursorToVisualPos(buf, 77, 80)).toEqual({ visualRow: 0, visualCol: 77 });
  });

  it('cursorToVisualPos: cursor row is always < total visual rows (consistency invariant)', () => {
    const w = 80;
    for (const len of [0, 1, 77, 78, 79, 156, 157]) {
      const buf = 'x'.repeat(len);
      const { visualRow } = cursorToVisualPos(buf, len, w);
      expect(visualRow).toBeLessThan(visualRowsForLine(buf, w));
    }
  });

  it('cursorToVisualPos: multi-line buffer accounts for prior logical lines', () => {
    // Line 0: 78 chars → 2 visual rows. Line 1: 'hello' → 1 visual row.
    const buf = 'x'.repeat(78) + '\nhello';
    expect(cursorToVisualPos(buf, buf.length, 80)).toEqual({ visualRow: 2, visualCol: 5 });
  });

  it('cursorToVisualPos: cursor at newline boundary is on last visual row of previous line', () => {
    const buf = 'abc\ndef';
    // cursor=3 is end of 'abc', before the newline
    expect(cursorToVisualPos(buf, 3, 80)).toEqual({ visualRow: 0, visualCol: 3 });
    // cursor=4 is start of 'def'
    expect(cursorToVisualPos(buf, 4, 80)).toEqual({ visualRow: 1, visualCol: 0 });
  });
});
