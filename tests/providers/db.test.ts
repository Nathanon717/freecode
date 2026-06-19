import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// db.ts reads its store dir from $FREECODE_STORE and config dir from $FREECODE_HOME.
// Both are pointed at temp dirs so tests never touch committed state or require network.
// resetStore() is called between tests so the module-level client+cache are cleared.
let db: typeof import('../../src/providers/db.js');
let tempStore = '';
let tempHome = '';
const previousStore = process.env.FREECODE_STORE;
const previousHome = process.env.FREECODE_HOME;

beforeEach(async () => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-db-'));
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-home-'));
  process.env.FREECODE_STORE = tempStore;
  process.env.FREECODE_HOME = tempHome;
  db = await import('../../src/providers/db.js');
});

afterEach(async () => {
  await db.resetStore();
  if (previousStore === undefined) delete process.env.FREECODE_STORE;
  else process.env.FREECODE_STORE = previousStore;
  if (previousHome === undefined) delete process.env.FREECODE_HOME;
  else process.env.FREECODE_HOME = previousHome;
  // Best-effort cleanup — Windows may hold SQLite WAL file handles briefly after close().
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS will clean up */ }
  try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

describe('db: lifecycle', () => {
  it('getCache() returns null before initStore()', () => {
    expect(db.getCache()).toBeNull();
  });

  it('initStore() initialises an empty cache for a fresh DB', async () => {
    await db.initStore();
    expect(db.getCache()).toEqual({});
  });

  it('resetStore() clears the cache back to null', async () => {
    await db.initStore();
    await db.resetStore();
    expect(db.getCache()).toBeNull();
    await db.initStore(); // re-init so afterEach cleanup works
  });

  it('initStore() can be called again after resetStore()', async () => {
    await db.initStore();
    await db.resetStore();
    await db.initStore();
    expect(db.getCache()).toEqual({});
  });
});

describe('db: cache operations', () => {
  it('setCache() updates the in-memory cache synchronously', async () => {
    await db.initStore();
    db.setCache({ 'groq:llama': { provider: 'groq', modelId: 'llama' } });
    expect(db.getCache()).toMatchObject({
      'groq:llama': { provider: 'groq', modelId: 'llama' },
    });
  });

  it('setCache() replaces the entire cache', async () => {
    await db.initStore();
    db.setCache({ 'groq:a': { provider: 'groq', modelId: 'a' } });
    db.setCache({ 'groq:b': { provider: 'groq', modelId: 'b' } });
    const cache = db.getCache()!;
    expect(cache['groq:b']).toBeDefined();
    expect(cache['groq:a']).toBeUndefined();
  });
});

describe('db: DB persistence round-trip', () => {
  it('data written via setCache() is visible after reinitialising from the same DB', async () => {
    await db.initStore();
    db.setCache({
      'groq:llama': { provider: 'groq', modelId: 'llama', isFavorite: true },
    });

    // Give the fire-and-forget persistAsync a moment to complete.
    await new Promise(r => setTimeout(r, 200));

    await db.resetStore();
    await db.initStore();

    const cache = db.getCache();
    expect(cache?.['groq:llama']).toMatchObject({
      provider: 'groq',
      modelId: 'llama',
      isFavorite: true,
    });
  });

  it('eval runs are persisted and re-loaded with derived transcriptRef', async () => {
    await db.initStore();
    db.setCache({
      'groq:llama': {
        provider: 'groq',
        modelId: 'llama',
        evals: {
          humaneval: [
            {
              timestamp: '2026-06-19T10:00:00.000Z',
              taskId: 'HumanEval/0',
              pass: true,
              turns: 2,
              tokenUsage: { input: 100, output: 50 },
              durationMs: 1234,
              transcriptRef: 'evals/humaneval/groq-llama/20260619T100000000Z.json',
              error: null,
            },
          ],
        },
      },
    });

    await new Promise(r => setTimeout(r, 200));

    await db.resetStore();
    await db.initStore();

    const run = db.getCache()?.['groq:llama']?.evals?.['humaneval']?.[0];
    expect(run).toBeDefined();
    expect(run?.taskId).toBe('HumanEval/0');
    expect(run?.pass).toBe(true);
    expect(run?.transcriptRef).toMatch(/^evals\/humaneval\/groq-llama\//);
  });
});
