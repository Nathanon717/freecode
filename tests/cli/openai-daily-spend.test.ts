import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchOpenAITodayCosts,
  isOpenAIModelPreference,
  refreshOpenAIDailySpend,
  resetOpenAIDailySpendCache,
  type OpenAIDailySpend,
} from '../../src/cli/openai-daily-spend.js';

describe('OpenAI daily spend footer data', () => {
  const originalAdminKey = process.env.OPENAI_ADMIN_KEY;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    resetOpenAIDailySpendCache();
    vi.restoreAllMocks();
    if (originalAdminKey === undefined) {
      delete process.env.OPENAI_ADMIN_KEY;
    } else {
      process.env.OPENAI_ADMIN_KEY = originalAdminKey;
    }
    globalThis.fetch = originalFetch;
  });

  it('returns idle when OPENAI_ADMIN_KEY is missing', async () => {
    delete process.env.OPENAI_ADMIN_KEY;

    await expect(fetchOpenAITodayCosts(new Date('2026-05-22T12:34:00.000Z'))).resolves.toMatchObject({
      state: 'idle',
      warning: 'OPENAI_ADMIN_KEY missing',
    });
  });

  it('fetches the current UTC day costs and sums USD results', async () => {
    process.env.OPENAI_ADMIN_KEY = 'admin-key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          object: 'bucket',
          start_time: 1779408000,
          end_time: 1779494400,
          results: [
            { amount: { value: 1.2, currency: 'usd' } },
            { amount: { value: 0.034, currency: 'usd' } },
            { amount: { value: 9, currency: 'eur' } },
          ],
        },
      ],
    }), { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;

    const snapshot = await fetchOpenAITodayCosts(new Date('2026-05-22T12:34:00.000Z'));
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(url.searchParams.get('start_time')).toBe('1779408000');
    expect(url.searchParams.get('bucket_width')).toBe('1d');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer admin-key' },
    });
    expect(snapshot).toMatchObject({
      state: 'ready',
      amountUsd: 1.234,
      formattedAmountUsd: '$1.23',
      startTime: 1779408000,
      endTime: 1779494400,
    });
  });

  it('reuses a fresh cached refresh snapshot', async () => {
    const snapshots: OpenAIDailySpend[] = [];
    const fetchCosts = vi.fn(async () => ({
      state: 'ready' as const,
      amountUsd: 0.42,
      formattedAmountUsd: '$0.42',
      updatedAt: Date.now(),
    }));

    refreshOpenAIDailySpend({
      fetchCosts,
      setOpenAIDailySpend: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
      now: () => new Date('2026-05-22T12:34:00.000Z'),
    });
    await vi.waitFor(() => expect(fetchCosts).toHaveBeenCalledTimes(1));

    refreshOpenAIDailySpend({
      fetchCosts,
      setOpenAIDailySpend: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
      now: () => new Date('2026-05-22T12:35:00.000Z'),
    });

    expect(fetchCosts).toHaveBeenCalledTimes(1);
    expect(snapshots.at(-1)).toMatchObject({ state: 'ready', amountUsd: 0.42 });
  });

  it('only refreshes and displays daily spend for selected OpenAI models', async () => {
    expect(isOpenAIModelPreference('openai:gpt-5')).toBe(true);
    expect(isOpenAIModelPreference('groq:llama')).toBe(false);
    expect(isOpenAIModelPreference('openai:')).toBe(false);

    const snapshots: OpenAIDailySpend[] = [];
    const fetchCosts = vi.fn(async () => ({
      state: 'ready' as const,
      amountUsd: 0.42,
      formattedAmountUsd: '$0.42',
      updatedAt: Date.now(),
    }));

    refreshOpenAIDailySpend({
      modelPreference: 'openai:gpt-5',
      fetchCosts,
      setOpenAIDailySpend: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
    });
    await vi.waitFor(() => expect(fetchCosts).toHaveBeenCalledTimes(1));
    expect(snapshots.at(-1)).toMatchObject({ state: 'ready', amountUsd: 0.42 });

    refreshOpenAIDailySpend({
      modelPreference: 'groq:llama',
      fetchCosts,
      setOpenAIDailySpend: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
    });

    expect(fetchCosts).toHaveBeenCalledTimes(1);
    expect(snapshots.at(-1)).toMatchObject({ state: 'idle' });
  });
});
