import { describe, it, expect } from 'vitest';
import {
  parseGroqDuration,
  parseGroqRateLimitHeaders,
  supplementWithModelLimits,
  groqHeadersToSnapshot,
  parseMistralRateLimitSnapshot,
  parseCerebrasRateLimitSnapshot,
  extractGroqRateLimitBuckets,
  extractMistralRateLimitBuckets,
  extractCerebrasRateLimitBuckets,
  extractOpenAICompatRateLimitBuckets,
} from '../../../src/providers/quota/headers.js';

describe('parseGroqDuration', () => {
  it.each([
    // seconds
    ['2s', 2000],
    ['30s', 30000],
    ['1.5s', 1500],
    ['13.5s', 13500],
    ['0.5s', 500],
    // milliseconds — note "1ms" is 1 millisecond, NOT 1 minute
    ['300ms', 300],
    ['1ms', 1],
    ['1000ms', 1000],
    // minutes
    ['1m', 60000],
    ['5m', 300000],
    ['1m30s', 90000],
    ['2m15s', 135000],
    // hours
    ['1h', 3600000],
    ['1h30m', 5400000],
    ['1h2m3s', 3723000],
  ])('parses %p as %p ms', (input, expected) => {
    expect(parseGroqDuration(input)).toBe(expected);
  });

  it.each([
    [''], // empty
    ['abc'], // garbage
    ['1x'], // unknown unit
    ['1m30'], // trailing chars
    ['30'], // bare number
  ])('returns null for invalid input %p', (input) => {
    expect(parseGroqDuration(input)).toBeNull();
  });
});

describe('parseGroqRateLimitHeaders', () => {
  const sampleHeaders: Record<string, string> = {
    'x-ratelimit-limit-requests': '30',
    'x-ratelimit-limit-tokens': '6000',
    'x-ratelimit-remaining-requests': '29',
    'x-ratelimit-remaining-tokens': '5800',
    'x-ratelimit-reset-requests': '2s',
    'x-ratelimit-reset-tokens': '300ms',
  };

  it('parses all fields from a plain record', () => {
    const result = parseGroqRateLimitHeaders(sampleHeaders);
    expect(result.limitRequests).toBe(30);
    expect(result.limitTokens).toBe(6000);
    expect(result.remainingRequests).toBe(29);
    expect(result.remainingTokens).toBe(5800);
    expect(result.resetRequestsMs).toBe(2000);
    expect(result.resetTokensMs).toBe(300);
    expect(result.resetRequestsRaw).toBe('2s');
    expect(result.resetTokensRaw).toBe('300ms');
  });

  it('parses all fields from a Headers object', () => {
    const headers = new Headers(sampleHeaders);
    const result = parseGroqRateLimitHeaders(headers);
    expect(result.limitRequests).toBe(30);
    expect(result.remainingRequests).toBe(29);
    expect(result.resetRequestsMs).toBe(2000);
  });

  it('returns nulls for missing headers', () => {
    expect(parseGroqRateLimitHeaders({})).toEqual({
      limitRequests: null, limitTokens: null, remainingRequests: null, remainingTokens: null,
      resetRequestsMs: null, resetTokensMs: null, resetRequestsRaw: null, resetTokensRaw: null,
    });
  });

  it('returns null resetMs when duration is unparseable', () => {
    const result = parseGroqRateLimitHeaders({
      'x-ratelimit-reset-requests': 'garbage',
      'x-ratelimit-reset-tokens': '???',
    });
    expect(result.resetRequestsRaw).toBe('garbage');
    expect(result.resetRequestsMs).toBeNull();
    expect(result.resetTokensRaw).toBe('???');
    expect(result.resetTokensMs).toBeNull();
  });

  it('handles fractional second resets like Groq docs show', () => {
    const result = parseGroqRateLimitHeaders({
      'x-ratelimit-reset-requests': '13.5s',
      'x-ratelimit-reset-tokens': '1m30s',
    });
    expect(result.resetRequestsMs).toBe(13500);
    expect(result.resetTokensMs).toBe(90000);
  });

  it('returns null for non-numeric limit/remaining values', () => {
    const result = parseGroqRateLimitHeaders({
      'x-ratelimit-limit-requests': 'many',
      'x-ratelimit-remaining-tokens': 'lots',
    });
    expect(result.limitRequests).toBeNull();
    expect(result.remainingTokens).toBeNull();
  });
});

describe('supplementWithModelLimits', () => {
  const baseHeaders = {
    limitRequests: 30,
    limitTokens: 6000,
    remainingRequests: 25,
    remainingTokens: 5000,
    resetRequestsMs: 2000,
    resetTokensMs: 300,
    resetRequestsRaw: '2s',
    resetTokensRaw: '300ms',
  };

  it('spreads base headers and attaches model limits', () => {
    const result = supplementWithModelLimits(baseHeaders, {
      rpm: 60, rpd: 1000, tpm: 100000, tpd: 2000000,
    });
    expect(result.limitRequests).toBe(30);
    expect(result.remainingTokens).toBe(5000);
    expect(result.modelRpm).toBe(60);
    expect(result.modelRpd).toBe(1000);
    expect(result.modelTpm).toBe(100000);
    expect(result.modelTpd).toBe(2000000);
  });

  it('uses null for all model fields when limits not provided', () => {
    const result = supplementWithModelLimits(baseHeaders);
    expect(result.modelRpm).toBeNull();
    expect(result.modelRpd).toBeNull();
    expect(result.modelTpm).toBeNull();
    expect(result.modelTpd).toBeNull();
  });

  it('accepts tpd as null in model limits', () => {
    const result = supplementWithModelLimits(baseHeaders, {
      rpm: 60, rpd: 1000, tpm: 100000, tpd: null,
    });
    expect(result.modelTpd).toBeNull();
    expect(result.modelRpm).toBe(60);
  });
});

describe('groqHeadersToSnapshot', () => {
  it('returns two buckets with correct labels and values', () => {
    const snapshot = groqHeadersToSnapshot({
      limitRequests: 30,
      limitTokens: 6000,
      remainingRequests: 20,
      remainingTokens: 4500,
      resetRequestsMs: 2000,
      resetTokensMs: 500,
      resetRequestsRaw: '2s',
      resetTokensRaw: '500ms',
    });
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toEqual({ label: 'R', remaining: 20, limit: 30, resetMs: 2000 });
    expect(snapshot[1]).toEqual({ label: 'T', remaining: 4500, limit: 6000, resetMs: 500 });
  });

  it('propagates nulls', () => {
    const snapshot = groqHeadersToSnapshot({
      limitRequests: null,
      limitTokens: null,
      remainingRequests: null,
      remainingTokens: null,
      resetRequestsMs: null,
      resetTokensMs: null,
      resetRequestsRaw: null,
      resetTokensRaw: null,
    });
    expect(snapshot[0]).toEqual({ label: 'R', remaining: null, limit: null, resetMs: null });
    expect(snapshot[1]).toEqual({ label: 'T', remaining: null, limit: null, resetMs: null });
  });
});

describe('parseMistralRateLimitSnapshot', () => {
  it('returns both buckets when all headers present', () => {
    const snapshot = parseMistralRateLimitSnapshot({
      'x-ratelimit-limit-req-minute': '60',
      'x-ratelimit-remaining-req-minute': '55',
      'x-ratelimit-limit-tokens-minute': '100000',
      'x-ratelimit-remaining-tokens-minute': '98000',
    });
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0]).toEqual({ label: 'Rm', remaining: 55, limit: 60 });
    expect(snapshot[1]).toEqual({ label: 'Tm', remaining: 98000, limit: 100000 });
  });

  it('omits buckets when both limit and remaining are missing', () => {
    const snapshot = parseMistralRateLimitSnapshot({});
    expect(snapshot).toHaveLength(0);
  });

  it('includes bucket when only one of limit or remaining is present', () => {
    const snapshot = parseMistralRateLimitSnapshot({
      'x-ratelimit-limit-req-minute': '60',
    });
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ label: 'Rm', limit: 60, remaining: null });
  });

  it('parses from a Headers object', () => {
    const headers = new Headers({
      'x-ratelimit-limit-req-minute': '30',
      'x-ratelimit-remaining-req-minute': '28',
    });
    const snapshot = parseMistralRateLimitSnapshot(headers);
    expect(snapshot[0]).toMatchObject({ label: 'Rm', limit: 30, remaining: 28 });
  });

  it('returns null limit for non-numeric header values', () => {
    const snapshot = parseMistralRateLimitSnapshot({
      'x-ratelimit-limit-req-minute': 'many',
      'x-ratelimit-remaining-req-minute': '28',
    });
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ label: 'Rm', limit: null, remaining: 28 });
  });
});

describe('parseCerebrasRateLimitSnapshot', () => {
  it('returns all six buckets when minute/hour/day headers present', () => {
    const headers = {
      'x-ratelimit-limit-requests-minute': '60',
      'x-ratelimit-remaining-requests-minute': '58',
      'x-ratelimit-limit-tokens-minute': '100000',
      'x-ratelimit-remaining-tokens-minute': '99000',
      'x-ratelimit-limit-requests-hour': '1000',
      'x-ratelimit-remaining-requests-hour': '995',
      'x-ratelimit-limit-tokens-hour': '2000000',
      'x-ratelimit-remaining-tokens-hour': '1999000',
      'x-ratelimit-limit-requests-day': '10000',
      'x-ratelimit-remaining-requests-day': '9990',
      'x-ratelimit-limit-tokens-day': '50000000',
      'x-ratelimit-remaining-tokens-day': '49990000',
    };
    const snapshot = parseCerebrasRateLimitSnapshot(headers);
    expect(snapshot).toHaveLength(6);
    expect(snapshot[0]).toMatchObject({ label: 'Rm', limit: 60, remaining: 58 });
    expect(snapshot[1]).toMatchObject({ label: 'Tm', limit: 100000, remaining: 99000 });
    expect(snapshot[2]).toMatchObject({ label: 'Rh', limit: 1000, remaining: 995 });
    expect(snapshot[3]).toMatchObject({ label: 'Th', limit: 2000000, remaining: 1999000 });
    expect(snapshot[4]).toMatchObject({ label: 'Rd', limit: 10000, remaining: 9990 });
    expect(snapshot[5]).toMatchObject({ label: 'Td', limit: 50000000, remaining: 49990000 });
  });

  it('returns empty array when no headers present', () => {
    expect(parseCerebrasRateLimitSnapshot({})).toHaveLength(0);
  });

  it('only returns buckets with at least one value', () => {
    const snapshot = parseCerebrasRateLimitSnapshot({
      'x-ratelimit-limit-requests-minute': '60',
    });
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ label: 'Rm', limit: 60, remaining: null });
  });

  it('parses from a Headers object', () => {
    const headers = new Headers({
      'x-ratelimit-limit-requests-hour': '500',
      'x-ratelimit-remaining-requests-hour': '499',
    });
    const snapshot = parseCerebrasRateLimitSnapshot(headers);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ label: 'Rh', limit: 500, remaining: 499 });
  });
});

describe('extractGroqRateLimitBuckets', () => {
  it('returns both buckets when limits are non-null', () => {
    const buckets = extractGroqRateLimitBuckets({
      limitRequests: 30,
      limitTokens: 6000,
      remainingRequests: 20,
      remainingTokens: 5000,
      resetRequestsMs: 2000,
      resetTokensMs: 500,
      resetRequestsRaw: '2s',
      resetTokensRaw: '500ms',
    });
    expect(buckets['requests']).toEqual({ limit: 30, intervalMs: 2000 });
    expect(buckets['tokens']).toEqual({ limit: 6000, intervalMs: 500 });
  });

  it('omits buckets when limits are null', () => {
    const buckets = extractGroqRateLimitBuckets({
      limitRequests: null,
      limitTokens: null,
      remainingRequests: null,
      remainingTokens: null,
      resetRequestsMs: null,
      resetTokensMs: null,
      resetRequestsRaw: null,
      resetTokensRaw: null,
    });
    expect(Object.keys(buckets)).toHaveLength(0);
  });

  it('includes only present limits', () => {
    const buckets = extractGroqRateLimitBuckets({
      limitRequests: 30,
      limitTokens: null,
      remainingRequests: null,
      remainingTokens: null,
      resetRequestsMs: 1000,
      resetTokensMs: null,
      resetRequestsRaw: '1s',
      resetTokensRaw: null,
    });
    expect(buckets['requests']).toBeDefined();
    expect(buckets['tokens']).toBeUndefined();
  });
});

describe('extractMistralRateLimitBuckets', () => {
  it('returns per-minute buckets with fixed 60s interval', () => {
    const buckets = extractMistralRateLimitBuckets({
      'x-ratelimit-limit-req-minute': '60',
      'x-ratelimit-limit-tokens-minute': '100000',
    });
    expect(buckets['requests-per-minute']).toEqual({ limit: 60, intervalMs: 60_000 });
    expect(buckets['tokens-per-minute']).toEqual({ limit: 100000, intervalMs: 60_000 });
  });

  it('returns empty when no headers present', () => {
    expect(Object.keys(extractMistralRateLimitBuckets({}))).toHaveLength(0);
  });

  it('parses from a Headers object', () => {
    const headers = new Headers({ 'x-ratelimit-limit-req-minute': '30' });
    const buckets = extractMistralRateLimitBuckets(headers);
    expect(buckets['requests-per-minute']).toEqual({ limit: 30, intervalMs: 60_000 });
  });
});

describe('extractCerebrasRateLimitBuckets', () => {
  it('returns buckets with correct intervals for minute/hour/day', () => {
    const buckets = extractCerebrasRateLimitBuckets({
      'x-ratelimit-limit-requests-minute': '60',
      'x-ratelimit-limit-tokens-minute': '100000',
      'x-ratelimit-limit-requests-hour': '1000',
      'x-ratelimit-limit-tokens-hour': '2000000',
      'x-ratelimit-limit-requests-day': '10000',
      'x-ratelimit-limit-tokens-day': '50000000',
    });
    expect(buckets['requests-per-minute']).toEqual({ limit: 60, intervalMs: 60_000 });
    expect(buckets['tokens-per-minute']).toEqual({ limit: 100000, intervalMs: 60_000 });
    expect(buckets['requests-per-hour']).toEqual({ limit: 1000, intervalMs: 3_600_000 });
    expect(buckets['tokens-per-hour']).toEqual({ limit: 2000000, intervalMs: 3_600_000 });
    expect(buckets['requests-per-day']).toEqual({ limit: 10000, intervalMs: 86_400_000 });
    expect(buckets['tokens-per-day']).toEqual({ limit: 50000000, intervalMs: 86_400_000 });
  });

  it('returns empty when no headers present', () => {
    expect(Object.keys(extractCerebrasRateLimitBuckets({}))).toHaveLength(0);
  });
});

describe('extractOpenAICompatRateLimitBuckets', () => {
  it('dispatches to Mistral extractor for mistral provider', () => {
    const headers = new Headers({ 'x-ratelimit-limit-req-minute': '60' });
    const buckets = extractOpenAICompatRateLimitBuckets('mistral', headers);
    expect(buckets['requests-per-minute']).toBeDefined();
    expect(buckets['requests']).toBeUndefined();
  });

  it('dispatches to Cerebras extractor for cerebras provider', () => {
    const headers = new Headers({ 'x-ratelimit-limit-requests-minute': '100' });
    const buckets = extractOpenAICompatRateLimitBuckets('cerebras', headers);
    expect(buckets['requests-per-minute']).toBeDefined();
  });

  it('falls back to Groq extractor for unknown providers', () => {
    const headers = new Headers({
      'x-ratelimit-limit-requests': '30',
      'x-ratelimit-limit-tokens': '6000',
      'x-ratelimit-reset-requests': '2s',
      'x-ratelimit-reset-tokens': '500ms',
    });
    const buckets = extractOpenAICompatRateLimitBuckets('groq', headers);
    expect(buckets['requests']).toEqual({ limit: 30, intervalMs: 2000 });
    expect(buckets['tokens']).toEqual({ limit: 6000, intervalMs: 500 });
  });

  it('falls back to Groq for any unknown provider id', () => {
    const headers = new Headers({
      'x-ratelimit-limit-requests': '10',
      'x-ratelimit-reset-requests': '1m',
    });
    const buckets = extractOpenAICompatRateLimitBuckets('some-unknown-provider', headers);
    expect(buckets['requests']).toEqual({ limit: 10, intervalMs: 60_000 });
  });
});
