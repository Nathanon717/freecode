import { beforeEach, describe, expect, it } from 'vitest';
import {
  setTokenCount,
  setQuotaSnapshot,
  setModelStatus,
  setPreflightInputCost,
  setOpenAIDailySpend,
  setRetryBanner,
  formatEvalRunStatus,
  layoutFooterRightRows,
  composeBottomStatusLine,
  type PreflightInputCost,
} from '../../src/cli/footer-status.js';

function resetState() {
  setTokenCount(0);
  setQuotaSnapshot(null);
  setModelStatus('', '');
  setPreflightInputCost({ state: 'idle', providerId: '', modelId: '', updatedAt: 0 });
  setOpenAIDailySpend({ state: 'idle', updatedAt: 0 });
  setRetryBanner(null);
}

beforeEach(() => {
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
    setModelStatus('openai', 'gpt-4o');
    const rows = layoutFooterRightRows(80, 1);
    expect(rows[0]).toContain('openai:gpt-4o');
  });

  it('returns an array with at most rowBudget rows', () => {
    setModelStatus('provider', 'model');
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

  it('shows pending state for preflight input cost', () => {
    setPreflightInputCost({ state: 'pending', providerId: 'openai', modelId: 'gpt-4o', updatedAt: 0 });
    const rows = layoutFooterRightRows(200, 1);
    expect(rows[0]).toContain('counting');
  });

  it('shows ready preflight data with token count and cost', () => {
    setPreflightInputCost({
      state: 'ready',
      providerId: 'openai',
      modelId: 'gpt-4o',
      inputTokens: 1500,
      formattedInputUsd: '$0.003 USD',
      updatedAt: 0,
    });
    const rows = layoutFooterRightRows(200, 1);
    expect(rows[0]).toContain('1,500 in tok');
    expect(rows[0]).toContain('$0.003 USD');
  });
});

describe('composeBottomStatusLine', () => {
  it('returns a string of width-1 characters (reserves one char for left gutter)', () => {
    setModelStatus('p', 'm');
    const line = composeBottomStatusLine(30);
    expect(line.length).toBe(29);
  });

  it('returns empty string for width 1', () => {
    const line = composeBottomStatusLine(1);
    expect(line.length).toBe(0);
  });
});
