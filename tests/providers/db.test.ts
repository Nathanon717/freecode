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
  it('persistModelRowAsync() makes a model row visible after reinitialising from the same DB', async () => {
    await db.initStore();
    const entry = { provider: 'groq', modelId: 'llama', isFavorite: true };
    db.setCache({ 'groq:llama': entry });
    db.persistModelRowAsync('groq:llama', entry);

    // resetStore() drains all pending fire-and-forget writes before closing.
    await db.resetStore();
    await db.initStore();

    const cache = db.getCache();
    expect(cache?.['groq:llama']).toMatchObject({
      provider: 'groq',
      modelId: 'llama',
      isFavorite: true,
    });
  });

  it('eval runs are persisted via saveTranscriptAsync and re-loaded on reinit', async () => {
    await db.initStore();
    const modelEntry = { provider: 'groq', modelId: 'llama' };
    db.setCache({ 'groq:llama': modelEntry });
    db.persistModelRowAsync('groq:llama', modelEntry);

    const summary = {
      timestamp: '2026-06-19T10:00:00.000Z',
      taskId: 'HumanEval/0',
      pass: true,
      turns: 2,
      tokenUsage: { input: 100, output: 50 },
      durationMs: 1234,
      error: null,
    };
    db.saveTranscriptAsync('groq:llama', 'humaneval', summary, undefined, [], undefined);

    // resetStore() drains all pending fire-and-forget writes before closing.
    await db.resetStore();
    await db.initStore();

    const run = db.getCache()?.['groq:llama']?.evals?.['humaneval']?.[0];
    expect(run).toBeDefined();
    expect(run?.taskId).toBe('HumanEval/0');
    expect(run?.pass).toBe(true);
    expect(run?.turns).toBe(2);
  });
});

describe('db: config persistence round-trip', () => {
  let dbConfigCache: typeof import('../../src/providers/db-config-cache.js');

  beforeEach(async () => {
    dbConfigCache = await import('../../src/providers/db-config-cache.js');
  });

  it('getDbConfigCache() returns null before initStore()', () => {
    expect(dbConfigCache.getDbConfigCache()).toBeNull();
  });

  it('initStore() sets an empty DbConfigData when no config rows exist', async () => {
    await db.initStore();
    const cache = dbConfigCache.getDbConfigCache();
    expect(cache).not.toBeNull();
    expect(cache?.global).toBeNull();
    expect(cache?.providerOverrides).toBeNull();
  });

  it('resetStore() clears the DB config cache back to null', async () => {
    await db.initStore();
    await db.resetStore();
    expect(dbConfigCache.getDbConfigCache()).toBeNull();
    await db.initStore(); // re-init so afterEach cleanup works
  });

  it('persistDbConfig round-trips global config through DB', async () => {
    await db.initStore();
    const global = { toolRationale: false, showProviderUsage: true, parallelTools: false };
    dbConfigCache.setDbConfigCache({ global, providerOverrides: null });
    dbConfigCache.persistDbConfig('global', global);

    await db.resetStore();
    await db.initStore();

    const cache = dbConfigCache.getDbConfigCache();
    expect(cache?.global).toMatchObject({ toolRationale: false, showProviderUsage: true, parallelTools: false });
  });

  it('persistDbConfig round-trips providerOverrides through DB', async () => {
    await db.initStore();
    const overrides = { groq: { toolRationale: false }, anthropic: { parallelTools: true } };
    dbConfigCache.setDbConfigCache({ global: null, providerOverrides: overrides });
    dbConfigCache.persistDbConfig('providerOverrides', overrides);

    await db.resetStore();
    await db.initStore();

    const cache = dbConfigCache.getDbConfigCache();
    expect(cache?.providerOverrides).toMatchObject({
      groq: { toolRationale: false },
      anthropic: { parallelTools: true },
    });
  });

  it('persistDbConfig for both scopes survives full reset/reinit cycle', async () => {
    await db.initStore();
    const global = { defaultModel: 'anthropic:claude-opus-4-8', toolRationale: true };
    const overrides = { openai: { showProviderUsage: true } };
    dbConfigCache.setDbConfigCache({ global, providerOverrides: overrides });
    dbConfigCache.persistDbConfig('global', global);
    dbConfigCache.persistDbConfig('providerOverrides', overrides);

    await db.resetStore();
    await db.initStore();

    const cache = dbConfigCache.getDbConfigCache();
    expect(cache?.global?.defaultModel).toBe('anthropic:claude-opus-4-8');
    expect(cache?.providerOverrides?.['openai']?.showProviderUsage).toBe(true);
  });
});
