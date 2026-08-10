import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// db.ts reads its store dir from $FREECODE_STORE and config dir from $FREECODE_HOME.
// Both are pointed at temp dirs so tests never touch committed state or require network.
// resetStore() is called between tests so the module-level client+cache are cleared.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let db: typeof import('../../src/store/db.js');
let tempStore = '';
let tempHome = '';
const previousStore = process.env.FREECODE_STORE;
const previousHome = process.env.FREECODE_HOME;

beforeEach(async () => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-db-'));
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-home-'));
  process.env.FREECODE_STORE = tempStore;
  process.env.FREECODE_HOME = tempHome;
  db = await import('../../src/store/db.js');
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
  it('getModelData() returns null before initStore()', () => {
    expect(db.getModelData()).toBeNull();
  });

  it('initStore() initialises an empty cache for a fresh DB', async () => {
    await db.initStore();
    expect(db.getModelData()).toEqual({});
  });

  it('resetStore() clears the cache back to null', async () => {
    await db.initStore();
    await db.resetStore();
    expect(db.getModelData()).toBeNull();
    await db.initStore(); // re-init so afterEach cleanup works
  });

  it('initStore() can be called again after resetStore()', async () => {
    await db.initStore();
    await db.resetStore();
    await db.initStore();
    expect(db.getModelData()).toEqual({});
  });

  it('initStore() degrades gracefully when the DB is unusable (never rejects, never poisons later opens)', async () => {
    // Poison the store: make the db path a directory so opening/CREATE TABLE fails.
    // A thrown init would reject AND cache the rejected promise, crashing every
    // later menu that awaits ensureStoreReady(). It must resolve to an empty cache.
    mkdirSync(join(tempStore, 'freecode.db'), { recursive: true });

    await expect(db.initStore()).resolves.toBeUndefined();
    expect(db.getModelData()).toEqual({});

    // The memoized promise is not poisoned — a second open also resolves.
    await expect(db.initStore()).resolves.toBeUndefined();
    expect(db.getModelData()).toEqual({});
  });
});

describe('db: cache operations', () => {
  it('setModelData() updates the in-memory cache synchronously', async () => {
    await db.initStore();
    db.setModelData({ 'groq:llama': { provider: 'groq', modelId: 'llama' } });
    expect(db.getModelData()).toMatchObject({
      'groq:llama': { provider: 'groq', modelId: 'llama' },
    });
  });

  it('setModelData() replaces the entire cache', async () => {
    await db.initStore();
    db.setModelData({ 'groq:a': { provider: 'groq', modelId: 'a' } });
    db.setModelData({ 'groq:b': { provider: 'groq', modelId: 'b' } });
    const cache = db.getModelData()!;
    expect(cache['groq:b']).toBeDefined();
    expect(cache['groq:a']).toBeUndefined();
  });
});

describe('db: DB persistence round-trip', () => {
  it('persistModelRowAsync() makes a model row visible after reinitialising from the same DB', async () => {
    await db.initStore();
    const entry = { provider: 'groq', modelId: 'llama', isFavorite: true };
    db.setModelData({ 'groq:llama': entry });
    db.persistModelRowAsync('groq:llama', entry);

    // resetStore() drains all pending fire-and-forget writes before closing.
    await db.resetStore();
    await db.initStore();

    const cache = db.getModelData();
    expect(cache?.['groq:llama']).toMatchObject({
      provider: 'groq',
      modelId: 'llama',
      isFavorite: true,
    });
  });

  it('eval runs are persisted via saveTranscriptAsync and re-loaded on reinit', async () => {
    await db.initStore();
    const modelEntry = { provider: 'groq', modelId: 'llama' };
    db.setModelData({ 'groq:llama': modelEntry });
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

    const run = db.getModelData()?.['groq:llama']?.evals?.['humaneval']?.[0];
    expect(run).toBeDefined();
    expect(run?.taskId).toBe('HumanEval/0');
    expect(run?.pass).toBe(true);
    expect(run?.turns).toBe(2);
  });

  it('two runs with identical timestamps are both persisted (no silent drop)', async () => {
    await db.initStore();
    const modelEntry = { provider: 'groq', modelId: 'llama' };
    db.setModelData({ 'groq:llama': modelEntry });
    db.persistModelRowAsync('groq:llama', modelEntry);

    const sharedTimestamp = '2026-06-19T10:00:00.000Z';
    const base = {
      taskId: 'HumanEval/0',
      turns: 1,
      tokenUsage: { input: 10, output: 5 },
      durationMs: 100,
      error: null,
    };
    db.saveTranscriptAsync('groq:llama', 'humaneval', { ...base, timestamp: sharedTimestamp, pass: true }, undefined, [], undefined);
    db.saveTranscriptAsync('groq:llama', 'humaneval', { ...base, timestamp: sharedTimestamp, pass: false }, undefined, [], undefined);

    await db.resetStore();
    await db.initStore();

    const runs = db.getModelData()?.['groq:llama']?.evals?.['humaneval'];
    expect(runs).toHaveLength(2);
  });
});

describe('db: deleteModelRows', () => {
  it('deletes the model row and all children, returns true, and the delete survives reinit', async () => {
    await db.initStore();
    const entry = { provider: 'anthropic', modelId: 'claude-old' };
    const key = 'anthropic:claude-old';
    db.setModelData({ [key]: entry });
    db.persistModelRowAsync(key, entry);
    // A child row in each descendant table so the cascade is exercised.
    db.saveTranscriptAsync(key, 'humaneval', {
      timestamp: '2026-06-19T10:00:00.000Z', taskId: 'HumanEval/0', pass: true,
      turns: 1, tokenUsage: {}, durationMs: 10, error: null,
    }, undefined, [], undefined);
    db.persistCallLogAsync({ modelKey: key, timestamp: '2026-06-19T10:00:00.000Z' });
    await db.drainPendingWrites();

    const durable = await db.deleteModelRows([key]);
    expect(durable).toBe(true);
    // Gone from the in-memory cache immediately.
    expect(db.getModelData()?.[key]).toBeUndefined();

    // Gone from the DB too, and stays gone after a full reinit (no local-only revival).
    await db.resetStore();
    await db.initStore();
    expect(db.getModelData()?.[key]).toBeUndefined();
    const rows = await db.queryRawForTesting('SELECT count(*) n FROM models WHERE key = ?', [key]);
    expect(rows[0].n).toBe(0);
    const calls = await db.queryRawForTesting('SELECT count(*) n FROM llm_calls WHERE model_key = ?', [key]);
    expect(calls[0].n).toBe(0);
  });

  it('is a no-op that returns true for an empty key list', async () => {
    await db.initStore();
    await expect(db.deleteModelRows([])).resolves.toBe(true);
  });
});

describe('db: foreign key enforcement', () => {
  it('PRAGMA foreign_keys is live — inserting eval_run with bogus model_key throws', async () => {
    await db.initStore();
    await expect(
      db.executeRawForTesting(
        `INSERT INTO eval_runs (model_key, eval_type, task_id, timestamp, pass) VALUES (?, ?, ?, ?, ?)`,
        ['nonexistent:model', 'humaneval', 'task/0', '2026-01-01T00:00:00.000Z', 1]
      )
    ).rejects.toThrow();
  });
});

describe('db: config file mirror', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let dbConfigCache: typeof import('../../src/store/db-config-cache.js');

  beforeEach(async () => {
    dbConfigCache = await import('../../src/store/db-config-cache.js');
  });

  it('primeConfigCacheFromFile() populates db-config-cache from written mirror WITHOUT a client', () => {
    // Write a mirror file manually (no DB involved).
    const mirrorData = { global: { toolRationale: false, defaultModel: 'groq:llama' }, providerOverrides: null };
    const mirrorPath = join(tempStore, 'config-cache.json');
    writeFileSync(mirrorPath, JSON.stringify(mirrorData), 'utf-8');

    // Cache is still null — initStore() was not called.
    expect(dbConfigCache.getDbConfigCache()).toBeNull();

    // primeConfigCacheFromFile() should populate the cache from the file.
    db.primeConfigCacheFromFile();

    const cache = dbConfigCache.getDbConfigCache();
    expect(cache).not.toBeNull();
    expect(cache?.global?.toolRationale).toBe(false);
    expect(cache?.global?.defaultModel).toBe('groq:llama');
    expect(cache?.providerOverrides).toBeNull();
  });

  it('primeConfigCacheFromFile() missing mirror file → no-op, cache stays null', () => {
    expect(dbConfigCache.getDbConfigCache()).toBeNull();
    db.primeConfigCacheFromFile(); // mirror does not exist
    expect(dbConfigCache.getDbConfigCache()).toBeNull();
  });

  it('primeConfigCacheFromFile() corrupt mirror file → no-op, cache stays null', () => {
    const mirrorPath = join(tempStore, 'config-cache.json');
    writeFileSync(mirrorPath, 'NOT JSON { ', 'utf-8');
    expect(dbConfigCache.getDbConfigCache()).toBeNull();
    db.primeConfigCacheFromFile();
    expect(dbConfigCache.getDbConfigCache()).toBeNull();
  });

  it('initStore() writes the mirror after loading config from DB', async () => {
    const mirrorPath = join(tempStore, 'config-cache.json');
    expect(existsSync(mirrorPath)).toBe(false);

    await db.initStore();

    expect(existsSync(mirrorPath)).toBe(true);
    const raw = readFileSync(mirrorPath, 'utf-8');
    const parsed = JSON.parse(raw) as { global: unknown; providerOverrides: unknown };
    // Fresh DB has no config rows so both fields are null.
    expect(parsed.global).toBeNull();
    expect(parsed.providerOverrides).toBeNull();
  });

  it('initStore() writes mirror that includes persisted config values after round-trip', async () => {
    await db.initStore();
    const mirrorPath = join(tempStore, 'config-cache.json');

    // Persist a config value through the DB.
    const global = { toolRationale: false, defaultModel: 'anthropic:claude-sonnet-4' };
    dbConfigCache.setDbConfigCache({ global, providerOverrides: null });
    dbConfigCache.persistDbConfig('global', global);

    // Reset and re-init so the DB writes the mirror again.
    await db.resetStore();
    await db.initStore();

    expect(existsSync(mirrorPath)).toBe(true);
    const raw = readFileSync(mirrorPath, 'utf-8');
    const parsed = JSON.parse(raw) as { global: { toolRationale: boolean; defaultModel: string }; providerOverrides: unknown };
    expect(parsed.global?.toolRationale).toBe(false);
    expect(parsed.global?.defaultModel).toBe('anthropic:claude-sonnet-4');
  });

  it('writeConfigMirror() writes a file containing the new value', () => {
    const mirrorPath = join(tempStore, 'config-cache.json');
    const data = { global: { defaultModel: 'openai:gpt-4o', parallelTools: true }, providerOverrides: { groq: { toolRationale: false } } };

    db.writeConfigMirror(data);

    expect(existsSync(mirrorPath)).toBe(true);
    const raw = readFileSync(mirrorPath, 'utf-8');
    const parsed = JSON.parse(raw) as typeof data;
    expect(parsed.global?.defaultModel).toBe('openai:gpt-4o');
    expect(parsed.providerOverrides?.groq?.toolRationale).toBe(false);
  });
});

describe('db: config persistence round-trip', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let dbConfigCache: typeof import('../../src/store/db-config-cache.js');

  beforeEach(async () => {
    dbConfigCache = await import('../../src/store/db-config-cache.js');
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

// Regression guard for the "local state is incorrect, db file exists but metadata
// file does not" re-bootstrap (docs/bug log). A db file opened WITH sync tokens on a
// prior run leaves an `-info` replica-metadata sidecar. Opening that same file as a
// PLAIN (tokenless) client — which happens whenever Doppler didn't inject tokens —
// dirties the WAL and invalidates that metadata, so the next tokened run silently
// re-pulls the whole DB. The fix: a tokenless run over a replica declines to open.
describe('db: tokenless run over a sync replica', () => {
  it('declines to open a plain client when a `-info` replica sidecar exists (no persistence, replica preserved)', async () => {
    // Build a REAL, valid db file with a persisted model row, then close it. This is
    // what a prior synced run leaves behind. (Using a valid db is what makes this a
    // genuine guard: without the fix, the plain client opens it and loads the row.)
    await db.initStore();
    const entry = { provider: 'groq', modelId: 'llama' };
    db.setModelData({ 'groq:llama': entry });
    db.persistModelRowAsync('groq:llama', entry);
    await db.resetStore(); // drains the write, closes the client

    // Mark it as a sync replica by planting an `-info` sidecar. No sync tokens are set.
    const dbPath = join(tempStore, 'freecode.db');
    const infoPath = dbPath + '-info';
    const sidecar = '{"generation":15}';
    writeFileSync(infoPath, sidecar);
    const dbBytesBefore = readFileSync(dbPath);

    // Re-init tokenless. Must NOT crash, and must NOT emit the "Store init failed"
    // degrade (that path is for real errors, not this calm decline).
    await expect(db.initStore()).resolves.toBeUndefined();

    // Declined: the persisted `groq:llama` row is NOT loaded — the cache is empty.
    // Without the fix, the plain client would open the file and load it.
    expect(db.getModelData()).toEqual({});
    // The client was never opened — raw execution reports it's not initialized.
    await expect(db.executeRawForTesting('SELECT 1', [])).rejects.toThrow('DB not initialized');
    // The replica and its sync metadata are byte-for-byte intact (not opened, not wiped).
    expect(readFileSync(infoPath, 'utf-8')).toBe(sidecar);
    expect(readFileSync(dbPath).equals(dbBytesBefore)).toBe(true);
  });

  it('opens a real plain client when no `-info` sidecar exists (genuinely tokenless user)', async () => {
    await db.initStore();
    // A real client was opened against a plain local file — raw SQL works.
    await expect(db.executeRawForTesting('SELECT 1', [])).resolves.toBeUndefined();
    // A plain client is not a replica, so it never creates `-info` sync metadata.
    expect(existsSync(join(tempStore, 'freecode.db-info'))).toBe(false);
  });
});

// isReplicaConflict / wipeLocalDb / isSyncReplica now live in db-replica.ts and are
// covered by tests/store/db-replica.test.ts.
