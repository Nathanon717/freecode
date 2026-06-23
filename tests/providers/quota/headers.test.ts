import { describe, it, expect } from 'vitest';
import {
  parseGroqDuration,
  parseGroqRateLimitHeaders,
  parseAnthropicRateLimitHeaders,
  parseAnthropicExtendedHeaders,
  supplementWithModelLimits,
  groqHeadersToSnapshot,
  parseMistralRateLimitSnapshot,
  parseCerebrasRateLimitSnapshot,
  extractGroqRateLimitBuckets,
  extractMistralRateLimitBuckets,
  extractCerebrasRateLimitBuckets,
  extractOpenAICompatRateLimitBuckets,
  extractAnthropicRateLimitBuckets,
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
    const result = parseGroqRateLimitHeaders({});
    expect(result.limitRequests).toBeNull();
    expect(result.limitTokens).toBeNull();
    expect(result.remainingRequests).toBeNull();
    expect(result.remainingTokens).toBeNull();
    expect(result.resetRequestsMs).toBeNull();
    expect(result.resetTokensMs).toBeNull();
    expect(result.resetRequestsRaw).toBeNull();
    expect(result.resetTokensRaw).toBeNull();
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

describe('parseAnthropicRateLimitHeaders', () => {
  const futureIso = new Date(Date.now() + 60_000).toISOString();

  it('parses all fields from a plain record', () => {
    const result = parseAnthropicRateLimitHeaders({
      'anthropic-ratelimit-requests-limit': '100',
      'anthropic-ratelimit-tokens-limit': '50000',
      'anthropic-ratelimit-requests-remaining': '95',
      'anthropic-ratelimit-tokens-remaining': '48000',
      'anthropic-ratelimit-requests-reset': futureIso,
      'anthropic-ratelimit-tokens-reset': futureIso,
    });
    expect(result.limitRequests).toBe(100);
    expect(result.limitTokens).toBe(50000);
    expect(result.remainingRequests).toBe(95);
    expect(result.remainingTokens).toBe(48000);
    expect(result.resetRequestsRaw).toBe(futureIso);
    expect(result.resetTokensRaw).toBe(futureIso);
    // resetMs should be close to 60000 (within 500ms tolerance)
    expect(result.resetRequestsMs).toBeGreaterThan(59000);
    expect(result.resetRequestsMs).toBeLessThanOrEqual(60000);
    expect(result.resetTokensMs).toBeGreaterThan(59000);
  });

  it('parses all fields from a Headers object', () => {
    const headers = new Headers({
      'anthropic-ratelimit-requests-limit': '50',
      'anthropic-ratelimit-requests-remaining': '40',
      'anthropic-ratelimit-requests-reset': futureIso,
    });
    const result = parseAnthropicRateLimitHeaders(headers);
    expect(result.limitRequests).toBe(50);
    expect(result.remainingRequests).toBe(40);
    expect(result.resetRequestsMs).toBeGreaterThan(0);
  });

  it('returns nulls for missing headers', () => {
    const result = parseAnthropicRateLimitHeaders({});
    expect(result.limitRequests).toBeNull();
    expect(result.limitTokens).toBeNull();
    expect(result.remainingRequests).toBeNull();
    expect(result.remainingTokens).toBeNull();
    expect(result.resetRequestsMs).toBeNull();
    expect(result.resetTokensMs).toBeNull();
    expect(result.resetRequestsRaw).toBeNull();
    expect(result.resetTokensRaw).toBeNull();
  });

  it('returns null resetMs for invalid ISO timestamps', () => {
    const result = parseAnthropicRateLimitHeaders({
      'anthropic-ratelimit-requests-reset': 'not-a-date',
      'anthropic-ratelimit-tokens-reset': 'garbage',
    });
    expect(result.resetRequestsRaw).toBe('not-a-date');
    expect(result.resetRequestsMs).toBeNull();
    expect(result.resetTokensRaw).toBe('garbage');
    expect(result.resetTokensMs).toBeNull();
  });

  it('returns null for non-numeric limit/remaining values', () => {
    const result = parseAnthropicRateLimitHeaders({
      'anthropic-ratelimit-requests-limit': 'many',
      'anthropic-ratelimit-tokens-remaining': 'lots',
    });
    expect(result.limitRequests).toBeNull();
    expect(result.remainingTokens).toBeNull();
  });

  it('clamps past reset times to 0', () => {
    const pastIso = new Date(Date.now() - 10_000).toISOString();
    const result = parseAnthropicRateLimitHeaders({
      'anthropic-ratelimit-requests-reset': pastIso,
    });
    expect(result.resetRequestsMs).toBe(0);
  });
});

describe('parseAnthropicExtendedHeaders', () => {
  const futureIso = new Date(Date.now() + 30_000).toISOString();

  it('parses all extended fields from a plain record', () => {
    const result = parseAnthropicExtendedHeaders({
      'anthropic-ratelimit-input-tokens-limit': '40000',
      'anthropic-ratelimit-input-tokens-remaining': '38000',
      'anthropic-ratelimit-input-tokens-reset': futureIso,
      'anthropic-ratelimit-output-tokens-limit': '10000',
      'anthropic-ratelimit-output-tokens-remaining': '9500',
      'anthropic-ratelimit-output-tokens-reset': futureIso,
      'request-id': 'req_abc123',
    });
    expect(result.inputTokensLimit).toBe(40000);
    expect(result.inputTokensRemaining).toBe(38000);
    expect(result.inputTokensResetRaw).toBe(futureIso);
    expect(result.inputTokensResetMs).toBeGreaterThan(0);
    expect(result.outputTokensLimit).toBe(10000);
    expect(result.outputTokensRemaining).toBe(9500);
    expect(result.outputTokensResetRaw).toBe(futureIso);
    expect(result.outputTokensResetMs).toBeGreaterThan(0);
    expect(result.requestId).toBe('req_abc123');
  });

  it('parses from a Headers object', () => {
    const headers = new Headers({
      'anthropic-ratelimit-input-tokens-limit': '20000',
      'request-id': 'req_xyz',
    });
    const result = parseAnthropicExtendedHeaders(headers);
    expect(result.inputTokensLimit).toBe(20000);
    expect(result.requestId).toBe('req_xyz');
  });

  it('falls back to x-request-id when request-id is absent', () => {
    const result = parseAnthropicExtendedHeaders({
      'x-request-id': 'xreq_456',
    });
    expect(result.requestId).toBe('xreq_456');
  });

  it('returns nulls for missing headers', () => {
    const result = parseAnthropicExtendedHeaders({});
    expect(result.inputTokensLimit).toBeNull();
    expect(result.inputTokensRemaining).toBeNull();
    expect(result.inputTokensResetMs).toBeNull();
    expect(result.inputTokensResetRaw).toBeNull();
    expect(result.outputTokensLimit).toBeNull();
    expect(result.outputTokensRemaining).toBeNull();
    expect(result.outputTokensResetMs).toBeNull();
    expect(result.outputTokensResetRaw).toBeNull();
    expect(result.requestId).toBeNull();
  });

  it('returns null resetMs for invalid ISO timestamps', () => {
    const result = parseAnthropicExtendedHeaders({
      'anthropic-ratelimit-input-tokens-reset': 'bad-date',
    });
    expect(result.inputTokensResetMs).toBeNull();
  });

  it('returns null for non-numeric limit/remaining values', () => {
    const result = parseAnthropicExtendedHeaders({
      'anthropic-ratelimit-input-tokens-limit': 'unlimited',
      'anthropic-ratelimit-output-tokens-remaining': 'none',
    });
    expect(result.inputTokensLimit).toBeNull();
    expect(result.outputTokensRemaining).toBeNull();
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

describe('extractAnthropicRateLimitBuckets', () => {
  const baseHeaders = {
    limitRequests: 100,
    limitTokens: 200000,
    remainingRequests: 95,
    remainingTokens: 190000,
    resetRequestsMs: 60_000,
    resetTokensMs: 60_000,
    resetRequestsRaw: new Date(Date.now() + 60_000).toISOString(),
    resetTokensRaw: new Date(Date.now() + 60_000).toISOString(),
  };

  it('returns all four buckets when all limits are present', () => {
    const extended = {
      inputTokensLimit: 150000,
      inputTokensRemaining: 140000,
      inputTokensResetMs: 60_000,
      inputTokensResetRaw: null,
      outputTokensLimit: 50000,
      outputTokensRemaining: 45000,
      outputTokensResetMs: 60_000,
      outputTokensResetRaw: null,
      requestId: 'req_abc',
    };
    const buckets = extractAnthropicRateLimitBuckets(baseHeaders, extended);
    expect(buckets['requests']).toEqual({ limit: 100, intervalMs: 60_000 });
    expect(buckets['tokens']).toEqual({ limit: 200000, intervalMs: 60_000 });
    expect(buckets['input-tokens']).toEqual({ limit: 150000, intervalMs: 60_000 });
    expect(buckets['output-tokens']).toEqual({ limit: 50000, intervalMs: 60_000 });
  });

  it('omits buckets where limit is null', () => {
    const extended = {
      inputTokensLimit: null,
      inputTokensRemaining: null,
      inputTokensResetMs: null,
      inputTokensResetRaw: null,
      outputTokensLimit: null,
      outputTokensRemaining: null,
      outputTokensResetMs: null,
      outputTokensResetRaw: null,
      requestId: null,
    };
    const nullBase = { ...baseHeaders, limitRequests: null, limitTokens: null };
    const buckets = extractAnthropicRateLimitBuckets(nullBase, extended);
    expect(Object.keys(buckets)).toHaveLength(0);
  });

  it('uses fixed 60s interval for all Anthropic buckets', () => {
    const extended = {
      inputTokensLimit: 100,
      inputTokensRemaining: 100,
      inputTokensResetMs: 60_000,
      inputTokensResetRaw: null,
      outputTokensLimit: 200,
      outputTokensRemaining: 200,
      outputTokensResetMs: 60_000,
      outputTokensResetRaw: null,
      requestId: null,
    };
    const buckets = extractAnthropicRateLimitBuckets(baseHeaders, extended);
    for (const bucket of Object.values(buckets)) {
      expect(bucket.intervalMs).toBe(60_000);
    }
  });
});
