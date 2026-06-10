import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let tempDir = '';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'freecode-quota-cache-'));
  vi.resetModules();
  vi.doMock('../../../src/config/index.js', () => ({ getConfigDir: () => tempDir }));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('quota cache', () => {
  it('returns null for unknown provider', async () => {
    const { loadCachedQuota } = await import('../../../src/providers/quota/cache.js');
    expect(loadCachedQuota('no-such-provider')).toBeNull();
  });

  it('round-trips a snapshot', async () => {
    const { loadCachedQuota, saveQuotaToCache } = await import('../../../src/providers/quota/cache.js');
    const snapshot = {
      requestsLimit: 100,
      requestsRemaining: 90,
      requestsResetMs: 60000,
      tokensLimit: 10000,
      tokensRemaining: 9000,
      tokensResetMs: 60000,
    };
    saveQuotaToCache('groq', snapshot);
    const loaded = loadCachedQuota('groq');
    expect(loaded).not.toBeNull();
    expect(loaded!.snapshot).toEqual(snapshot);
    expect(typeof loaded!.savedAt).toBe('number');
  });

  it('overwrites existing entry on second save', async () => {
    const { loadCachedQuota, saveQuotaToCache } = await import('../../../src/providers/quota/cache.js');
    const snap1 = { requestsLimit: 100, requestsRemaining: 80, requestsResetMs: 0, tokensLimit: 0, tokensRemaining: 0, tokensResetMs: 0 };
    const snap2 = { requestsLimit: 100, requestsRemaining: 50, requestsResetMs: 0, tokensLimit: 0, tokensRemaining: 0, tokensResetMs: 0 };
    saveQuotaToCache('groq', snap1);
    saveQuotaToCache('groq', snap2);
    const loaded = loadCachedQuota('groq');
    expect(loaded!.snapshot.requestsRemaining).toBe(50);
  });

  it('isolates entries per provider', async () => {
    const { loadCachedQuota, saveQuotaToCache } = await import('../../../src/providers/quota/cache.js');
    const snap = { requestsLimit: 10, requestsRemaining: 5, requestsResetMs: 0, tokensLimit: 0, tokensRemaining: 0, tokensResetMs: 0 };
    saveQuotaToCache('groq', snap);
    expect(loadCachedQuota('openai')).toBeNull();
  });
});
