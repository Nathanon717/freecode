import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseRetryAfterMs,
  fetchWithRetry,
  registerRetryBannerSink,
  type RetryBannerInfo,
} from '../../../src/providers/adapters/adapter-http-retry.js';

afterEach(() => {
  vi.restoreAllMocks();
  registerRetryBannerSink(null);
});

describe('parseRetryAfterMs', () => {
  it('defaults to 1000ms for null/empty', () => {
    expect(parseRetryAfterMs(null)).toBe(1000);
    expect(parseRetryAfterMs('')).toBe(1000);
  });

  it('parses whole and fractional seconds (ceil)', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('0')).toBe(0);
    expect(parseRetryAfterMs('1.2')).toBe(2000);
  });

  it('parses an HTTP date into a future delay', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(1000);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it('falls back to 1000ms for unparseable values', () => {
    expect(parseRetryAfterMs('not-a-number')).toBe(1000);
  });
});

describe('fetchWithRetry', () => {
  const opts = { providerId: 'test', providerName: 'Test', maxWaitMs: 10_000 };

  function res(status: number, headers: Record<string, string> = {}): Response {
    return new Response('body', { status, headers });
  }

  it('returns the first response when it is not 429/503', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(200));
    const out = await fetchWithRetry('http://x', undefined, opts);
    expect(out.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 then returns the success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(res(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(res(200));
    const out = await fetchWithRetry('http://x', undefined, opts);
    expect(out.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('gives up after 5 retries and returns the last response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(503, { 'retry-after': '0' }));
    const out = await fetchWithRetry('http://x', undefined, opts);
    expect(out.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(6); // initial + 5 retries
  });

  it('invokes onRetryableResponse with each retryable response headers', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(res(429, { 'retry-after': '0', 'x-mark': 'a' }))
      .mockResolvedValueOnce(res(200));
    const seen: string[] = [];
    await fetchWithRetry('http://x', undefined, {
      ...opts,
      onRetryableResponse: (headers) => seen.push(headers.get('x-mark') ?? ''),
    });
    expect(seen).toEqual(['a']);
  });

  it('pushes a retry banner info then null through the registered sink', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(res(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(res(200));
    const calls: (RetryBannerInfo | null)[] = [];
    registerRetryBannerSink((info) => calls.push(info));
    await fetchWithRetry('http://x', undefined, opts);
    expect(calls.length).toBe(2);
    expect(calls[0]).toMatchObject({ name: 'Test', label: 'rate-limited' });
    expect(calls[1]).toBeNull();
  });

  it('labels a 503 without retry-after as unavailable', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200));
    const calls: (RetryBannerInfo | null)[] = [];
    registerRetryBannerSink((info) => calls.push(info));
    await fetchWithRetry('http://x', undefined, { providerId: 'test', providerName: 'Test', maxWaitMs: 0 });
    expect(calls[0]).toMatchObject({ label: 'unavailable' });
  });

  it('honors a retry-after longer than maxWaitMs instead of retrying early', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(res(429, { 'retry-after': '600' }))
        .mockResolvedValueOnce(res(200));
      const calls: (RetryBannerInfo | null)[] = [];
      registerRetryBannerSink((info) => calls.push(info));
      const pending = fetchWithRetry('http://x', undefined, {
        providerId: 'long-wait', providerName: 'Test', maxWaitMs: 10_000,
      });
      const startedAt = Date.now();
      await vi.advanceTimersByTimeAsync(600_000);
      expect((await pending).status).toBe(200);
      // maxWaitMs is 10s; the server said 600s, and 600s is what we wait.
      expect((calls[0] as RetryBannerInfo).targetMs - startedAt).toBe(600_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts a long retry-after wait via the request signal instead of sleeping it out', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res(429, { 'retry-after': '600' }));
      const controller = new AbortController();
      const pending = fetchWithRetry('http://x', { signal: controller.signal }, {
        ...opts, providerId: 'abortable',
      });
      // A caller whose own deadline is shorter than the retry-after must be able to
      // get out; before the signal was threaded through, this ran the full 600s.
      await vi.advanceTimersByTimeAsync(1000);
      controller.abort(new Error('caller deadline'));
      await expect(pending).rejects.toThrow('caller deadline');
    } finally {
      vi.useRealTimers();
    }
  });

  it('makes a concurrent call to the same provider wait out another call 429', async () => {
    vi.useFakeTimers();
    try {
      // First caller is rate-limited for 30s; second caller has not sent yet and
      // must park on the shared gate rather than walking into the same limit.
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(res(429, { 'retry-after': '30' }))
        .mockResolvedValue(res(200));
      const first = fetchWithRetry('http://x', undefined, { ...opts, providerId: 'shared' });
      await vi.advanceTimersByTimeAsync(1000);

      let secondDone = false;
      const second = fetchWithRetry('http://x', undefined, { ...opts, providerId: 'shared' })
        .then((r) => { secondDone = true; return r; });
      await vi.advanceTimersByTimeAsync(1000);
      expect(secondDone).toBe(false);

      await vi.advanceTimersByTimeAsync(30_000);
      expect((await first).status).toBe(200);
      expect((await second).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
