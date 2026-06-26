import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setTokenCount,
  setQuotaSnapshot,
  setActiveModel,
  setOpenAIDailySpend,
  setRetryBanner,
  formatEvalRunStatus,
  layoutFooterRightRows,
  composeBottomStatusLine,
  composeBottomRightStatus,
} from '../../src/cli/footer-status.js';

function resetState() {
  vi.useRealTimers();
  setTokenCount(0);
  setQuotaSnapshot(null);
  setActiveModel('', '');
  setOpenAIDailySpend({ state: 'idle', updatedAt: 0 });
  setRetryBanner(null);
}

beforeEach(() => {
  resetState();
});

afterEach(() => {
  resetState();
});

describe('formatEvalRunStatus', () => {
  it('returns empty string when no retry banner is set', () => {
    expect(formatEvalRunStatus()).toBe('');
  });

  it('shows name and label with countdown when time remains', () => {
    const now = 1_000_000;
    setRetryBanner({ name: 'eval-1', label: 'attempt 2', targetMs: now + 5000 });
    const result = formatEvalRunStatus(now);
    expect(result).toContain('eval-1');
    expect(result).toContain('attempt 2');
    expect(result).toContain('5s');
  });

  it('shows "retrying now" when target time has elapsed', () => {
    const now = 1_000_000;
    setRetryBanner({ name: 'eval-1', label: 'attempt 2', targetMs: now - 1 });
    expect(formatEvalRunStatus(now)).toContain('retrying now');
  });

  it('clears status after setRetryBanner(null)', () => {
    setRetryBanner({ name: 'x', label: 'y', targetMs: Date.now() + 999999 });
    setRetryBanner(null);
    expect(formatEvalRunStatus()).toBe('');
  });
});

describe('layoutFooterRightRows', () => {
  it('returns a single row when budget is 1', () => {
    setTokenCount(42);
    const rows = layoutFooterRightRows(80, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('42 ctx');
  });

  it('includes model status when both provider and model are set', () => {
    setActiveModel('openai', 'gpt-4o');
    const rows = layoutFooterRightRows(80, 1);
    expect(rows[0]).toContain('openai:gpt-4o');
  });

  it('returns an array with at most rowBudget rows', () => {
    setActiveModel('provider', 'model');
    setTokenCount(100);
    const rows = layoutFooterRightRows(80, 3);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  it('shows token count even with empty model', () => {
    setTokenCount(7);
    const rows = layoutFooterRightRows(80, 1);
    expect(rows[0]).toContain('7 ctx');
  });

});

describe('composeBottomStatusLine', () => {
  it('returns a string of width-1 characters (reserves one char for left gutter)', () => {
    setActiveModel('p', 'm');
    const line = composeBottomStatusLine(30);
    expect(line.length).toBe(29);
  });

  it('returns empty string for width 1', () => {
    const line = composeBottomStatusLine(1);
    expect(line.length).toBe(0);
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
});

describe('composeBottomRightStatus', () => {
  it('keeps model and token count visible when quota status is too wide', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setActiveModel('groq', 'llama-3.3-70b-versatile');
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
    setActiveModel('openai', 'gpt-5.4-nano-2026-03-17');
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

});
