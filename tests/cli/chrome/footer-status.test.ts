import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setQuotaSnapshot,
  setActiveModel,
  setOpenAIDailySpend,
  setRetryBanner,
  formatEvalRunStatus,
  layoutFooterRightRows,
} from '../../../src/cli/chrome/footer-status.js';

function resetState() {
  vi.useRealTimers();
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
