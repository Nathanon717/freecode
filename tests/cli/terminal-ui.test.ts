import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  composeBottomRightStatus,
  composeBottomStatusLine,
  getInlineCompletionSuffix,
  setModelStatus,
  setQuotaSnapshot,
  setTokenCount,
} from '../../src/cli/terminal-ui.js';

describe('bottom pinned status section', () => {
  afterEach(() => {
    vi.useRealTimers();
    setModelStatus('', '');
    setQuotaSnapshot(null);
    setTokenCount(0);
  });

  it('right-aligns quota status and current context token count', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setQuotaSnapshot({
      limitRequests: 1000,
      remainingRequests: 974,
      limitTokens: 12000,
      remainingTokens: 12000,
      resetRequestsMs: 2_205_000,
      resetTokensMs: 0,
      resetRequestsRaw: null,
      resetTokensRaw: null,
    });
    setTokenCount(123);

    expect(composeBottomStatusLine(123, now.getTime())).toBe(
      '                                                    R  974/1000 full 36m45s | T 12000/12000 full 0s     |   123 ctx tokens'
    );
  });

  it('keeps context token count visible when model and quota status are too wide', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setModelStatus('groq', 'llama-3.3-70b-versatile');
    setQuotaSnapshot({
      limitRequests: 1000,
      remainingRequests: 985,
      limitTokens: 12000,
      remainingTokens: 12000,
      resetRequestsMs: 1_287_000,
      resetTokensMs: 0,
      resetRequestsRaw: null,
      resetTokensRaw: null,
    });
    setTokenCount(123);

    const status = composeBottomRightStatus(62, now.getTime());

    expect(status).toContain('R  985/1000');
    expect(status).toContain('T 12000/12000');
    expect(status).toContain('|   123 ctx tokens');
    expect(status).toContain('123 ctx tokens');
    expect(status.length).toBeLessThanOrEqual(62);
  });

  it('keeps fixed footer labels in the same columns as quota values change width', () => {
    const now = new Date('2026-05-18T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    setQuotaSnapshot({
      limitRequests: 1000,
      remainingRequests: 9,
      limitTokens: 12000,
      remainingTokens: 89,
      resetRequestsMs: 2_000,
      resetTokensMs: 0,
      resetRequestsRaw: null,
      resetTokensRaw: null,
    });
    setTokenCount(7);
    const lowValues = composeBottomRightStatus(80, now.getTime());

    setQuotaSnapshot({
      limitRequests: 1000,
      remainingRequests: 986,
      limitTokens: 12000,
      remainingTokens: 12000,
      resetRequestsMs: 1_188_000,
      resetTokensMs: 0,
      resetRequestsRaw: null,
      resetTokensRaw: null,
    });
    setTokenCount(289);
    const highValues = composeBottomRightStatus(80, now.getTime());

    for (const label of ['/1000 full', '| T', '/12000 full', '|']) {
      expect(highValues.indexOf(label)).toBe(lowValues.indexOf(label));
    }
    expect(highValues.indexOf('ctx tokens')).toBe(lowValues.indexOf('ctx tokens'));
  });
});

describe('inline command completion', () => {
  it('returns only the ghost suffix after the typed input', () => {
    expect(getInlineCompletionSuffix('/e', '/eval')).toBe('val');
    expect(getInlineCompletionSuffix('/eval', '/eval')).toBe('');
    expect(getInlineCompletionSuffix('hello', null)).toBe('');
  });
});
