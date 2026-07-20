import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setQuotaSnapshot,
  setActiveModel,
  setContextUsage,
  setOpenAIDailySpend,
  setRetryBanner,
  formatEvalRunStatus,
  layoutFooterRightRows,
} from '../../../src/cli/chrome/footer-status.js';

function resetState() {
  vi.useRealTimers();
  setQuotaSnapshot(null);
  setActiveModel('', '');
  setContextUsage(null);
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
  it('returns a single empty row when nothing is set', () => {
    expect(layoutFooterRightRows(80, 1)).toEqual(['']);
  });

  it('returns a single row containing the model when budget is 1', () => {
    setActiveModel('openai', 'gpt-4o');
    const rows = layoutFooterRightRows(80, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('openai:gpt-4o');
  });

  it('returns an array with at most rowBudget rows', () => {
    setActiveModel('provider', 'model');
    setQuotaSnapshot([{ label: 'R', remaining: 10, limit: 100, resetMs: 1000 }]);
    const rows = layoutFooterRightRows(80, 3);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  it('shows quota status even with an empty model', () => {
    setQuotaSnapshot([{ label: 'R', remaining: 7, limit: 10, resetMs: 1000 }]);
    expect(layoutFooterRightRows(80, 1)[0]).toContain('R');
  });
});

describe('layoutFooterRightRows single-row', () => {
  it('keeps model visible when quota status is too wide', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setActiveModel('groq', 'llama-3.3-70b-versatile');
    setQuotaSnapshot([
      { label: 'R', remaining: 985, limit: 1000, resetMs: 1_287_000 },
      { label: 'T', remaining: 12000, limit: 12000, resetMs: 0 },
    ]);

    const status = layoutFooterRightRows(62, 1, now.getTime())[0];

    expect(status).toContain('groq:llama-3.3-70b-versatile');
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
    const lowValues = layoutFooterRightRows(80, 1, now.getTime())[0];

    setQuotaSnapshot([
      { label: 'R', remaining: 986, limit: 1000, resetMs: 1_188_000 },
      { label: 'T', remaining: 12000, limit: 12000, resetMs: 0 },
    ]);
    const highValues = layoutFooterRightRows(80, 1, now.getTime())[0];

    for (const label of ['/1000 full', '| T', '/12000 full', '|']) {
      expect(highValues.indexOf(label)).toBe(lowValues.indexOf(label));
    }
  });

  it('renders OpenAI daily spend when available', () => {
    setOpenAIDailySpend({
      state: 'ready',
      amountUsd: 1.23,
      formattedAmountUsd: '$1.23',
      updatedAt: Date.now(),
    });

    const status = layoutFooterRightRows(80, 1)[0];

    expect(status).toContain('OpenAI today $1.23');
  });

  it('renders OpenAI daily spend missing-key and failure states', () => {
    setOpenAIDailySpend({
      state: 'idle',
      warning: 'OPENAI_ADMIN_KEY missing',
      updatedAt: Date.now(),
    });
    expect(layoutFooterRightRows(80, 1)[0]).toContain('OpenAI spend off: OPENAI_ADMIN_KEY missing');

    setOpenAIDailySpend({
      state: 'unavailable',
      warning: 'OpenAI costs HTTP 401',
      updatedAt: Date.now(),
    });
    expect(layoutFooterRightRows(80, 1)[0]).toContain('OpenAI spend failed: OpenAI costs HTTP 401');
  });

  it('shows the exact context tokens and window the provider reported', () => {
    setActiveModel('openai', 'gpt-4o');
    setContextUsage({ tokens: 12345, window: 128000 });
    const status = layoutFooterRightRows(80, 1)[0];
    // Byte-for-byte: raw integers, no separators, no rounding, no percentage.
    expect(status).toContain('12345/128000 ctx');
  });

  it('shows bare token count with no slash when the window is unknown', () => {
    setActiveModel('openai', 'gpt-4o');
    setContextUsage({ tokens: 12345, window: null });
    const status = layoutFooterRightRows(80, 1)[0];
    expect(status).toContain('12345 ctx');
    expect(status).not.toContain('/');
  });

  it('never renders a window of zero as a denominator', () => {
    setContextUsage({ tokens: 500, window: 0 });
    const status = layoutFooterRightRows(80, 1)[0];
    expect(status).toContain('500 ctx');
    expect(status).not.toContain('500/0');
  });

  it('shows nothing for context until a count is measured', () => {
    setActiveModel('openai', 'gpt-4o');
    // setContextUsage never called (reset to null) — no fabricated estimate.
    const status = layoutFooterRightRows(80, 1)[0];
    expect(status).not.toContain('ctx');
  });

  it('keeps ctx on the primary row but drops it before the model when narrow', () => {
    setActiveModel('openai', 'gpt-4o');
    setContextUsage({ tokens: 12345, window: 128000 });
    // Width fits "openai:gpt-4o" (13) but not "| 12345/128000 ctx".
    const status = layoutFooterRightRows(20, 1)[0];
    expect(status).toContain('openai:gpt-4o');
    expect(status).not.toContain('ctx');
    expect(status.length).toBeLessThanOrEqual(20);
  });

  it('drops ctx after quota is already gone but before the model', () => {
    setActiveModel('openai', 'gpt-4o');
    setContextUsage({ tokens: 999, window: 128000 });
    setQuotaSnapshot([{ label: 'R', remaining: 985, limit: 1000, resetMs: 1_287_000 }]);
    // "openai:gpt-4o | 999/128000 ctx" is exactly 30 chars; quota does not fit.
    const status = layoutFooterRightRows(30, 1)[0];
    expect(status).toContain('openai:gpt-4o');
    expect(status).toContain('999/128000 ctx');
    expect(status).not.toContain('R  985/1000');
  });

  it('drops OpenAI daily spend before dropping model', () => {
    setActiveModel('openai', 'gpt-5.4-nano-2026-03-17');
    setOpenAIDailySpend({
      state: 'ready',
      amountUsd: 1.23,
      formattedAmountUsd: '$1.23',
      updatedAt: Date.now(),
    });

    const status = layoutFooterRightRows(44, 1)[0];

    expect(status).toContain('openai:gpt-5.4-nano-2026-03-17');
    expect(status).not.toContain('OpenAI today $1.23');
    expect(status.length).toBeLessThanOrEqual(44);
  });
});
