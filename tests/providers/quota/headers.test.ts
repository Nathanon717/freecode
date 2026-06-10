import { describe, it, expect } from 'vitest';
import { parseGroqDuration, parseGroqRateLimitHeaders } from '../../../src/providers/quota/headers.js';

describe('parseGroqDuration', () => {
  describe('seconds', () => {
    it('parses integer seconds', () => {
      expect(parseGroqDuration('2s')).toBe(2000);
      expect(parseGroqDuration('30s')).toBe(30000);
    });

    it('parses fractional seconds', () => {
      expect(parseGroqDuration('1.5s')).toBe(1500);
      expect(parseGroqDuration('13.5s')).toBe(13500);
      expect(parseGroqDuration('0.5s')).toBe(500);
    });
  });

  describe('milliseconds', () => {
    it('parses milliseconds', () => {
      expect(parseGroqDuration('300ms')).toBe(300);
      expect(parseGroqDuration('1ms')).toBe(1);
      expect(parseGroqDuration('1000ms')).toBe(1000);
    });
  });

  describe('minutes', () => {
    it('parses whole minutes', () => {
      expect(parseGroqDuration('1m')).toBe(60000);
      expect(parseGroqDuration('5m')).toBe(300000);
    });

    it('parses minutes and seconds', () => {
      expect(parseGroqDuration('1m30s')).toBe(90000);
      expect(parseGroqDuration('2m15s')).toBe(135000);
    });
  });

  describe('hours', () => {
    it('parses whole hours', () => {
      expect(parseGroqDuration('1h')).toBe(3600000);
    });

    it('parses hours and minutes', () => {
      expect(parseGroqDuration('1h30m')).toBe(5400000);
    });

    it('parses hours, minutes, and seconds', () => {
      expect(parseGroqDuration('1h2m3s')).toBe(3723000);
    });
  });

  describe('invalid input', () => {
    it('returns null for empty string', () => {
      expect(parseGroqDuration('')).toBeNull();
    });

    it('returns null for garbage strings', () => {
      expect(parseGroqDuration('abc')).toBeNull();
      expect(parseGroqDuration('1x')).toBeNull();
      expect(parseGroqDuration('1m30')).toBeNull(); // trailing chars
    });

    it('does not confuse ms with m', () => {
      // "1ms" should be 1 millisecond, NOT 1 minute
      expect(parseGroqDuration('1ms')).toBe(1);
    });

    it('does not parse bare numbers', () => {
      expect(parseGroqDuration('30')).toBeNull();
    });
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
});
