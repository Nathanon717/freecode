import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercises the ONE path that can't be reached against a real file: DB (Turso)
// embedded-replica sync recovery in openAndPrepareClient(). @libsql/client is the
// single module mocked, so createClient() returns a fake whose sync() behaviour is
// scripted per test. Everything the recovery observes — the wipe of the on-disk
// replica sidecars — happens against a REAL temp dir, so the assertions are on real
// file state, not "was the mock called".

// Per-test knobs (reset in beforeEach). syncBehaviours[i] scripts the i-th client's
// sync(): 'ok' resolves, 'walconflict'/'network' throw the respective error.
let syncBehaviours: Array<'ok' | 'walconflict' | 'network'> = [];
let createdClients = 0;
let closedClients = 0;

vi.mock('@libsql/client', () => ({
  createClient: () => {
    const myIndex = createdClients++;
    return {
      sync(): Promise<void> {
        const b = syncBehaviours[myIndex] ?? 'ok';
        if (b === 'walconflict') return Promise.reject(new Error('libsql::sync: insert error (frame=84): WalConflict'));
        if (b === 'network') return Promise.reject(new Error('network timeout while syncing'));
        return Promise.resolve();
      },
      execute(): Promise<{ rows: never[]; lastInsertRowid: bigint }> {
        return Promise.resolve({ rows: [], lastInsertRowid: 0n });
      },
      close() { closedClients++; },
    };
  },
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let db: typeof import('../../src/providers/db.js');
let tempStore = '';
let tempHome = '';
const prev = {
  store: process.env.FREECODE_STORE,
  home: process.env.FREECODE_HOME,
  syncUrl: process.env.FREECODE_DB_SYNC_URL,
  authToken: process.env.FREECODE_DB_AUTH_TOKEN,
};

/** Plant a db file + its libSQL replica sidecars so a wipe is observable. */
function plantReplicaFiles(): { dbPath: string; infoPath: string } {
  const dbPath = join(tempStore, 'freecode.db');
  const infoPath = dbPath + '-info';
  writeFileSync(dbPath, 'db');
  writeFileSync(infoPath, '{"generation":15}');
  writeFileSync(dbPath + '-wal', 'wal');
  return { dbPath, infoPath };
}

beforeEach(async () => {
  syncBehaviours = [];
  createdClients = 0;
  closedClients = 0;
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-sync-'));
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-home-'));
  process.env.FREECODE_STORE = tempStore;
  process.env.FREECODE_HOME = tempHome;
  // Configure Turso sync so openAndPrepareClient takes the synced-replica branch.
  process.env.FREECODE_DB_SYNC_URL = 'libsql://example.turso.io';
  process.env.FREECODE_DB_AUTH_TOKEN = 'token';
  db = await import('../../src/providers/db.js');
});

afterEach(async () => {
  await db.resetStore();
  for (const [key, val] of [
    ['FREECODE_STORE', prev.store], ['FREECODE_HOME', prev.home],
    ['FREECODE_DB_SYNC_URL', prev.syncUrl], ['FREECODE_DB_AUTH_TOKEN', prev.authToken],
  ] as const) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS cleanup */ }
  try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* OS cleanup */ }
});

describe('db: synced-replica sync recovery', () => {
  it('WalConflict → closes, wipes the replica (incl. `-info`), reopens, and re-pulls once', async () => {
    const { infoPath } = plantReplicaFiles();
    syncBehaviours = ['walconflict', 'ok']; // first client diverged; the re-pulled one is clean

    await expect(db.initStore()).resolves.toBeUndefined();

    // A second client was opened (reopened after the wipe) and the first was closed.
    expect(createdClients).toBe(2);
    expect(closedClients).toBeGreaterThanOrEqual(1);
    // The diverged replica's sidecars were wiped — the conflict can't survive the re-pull.
    expect(existsSync(infoPath)).toBe(false);
    // Recovered cleanly: an empty cache, not a degraded/crashed init.
    expect(db.getModelData()).toEqual({});
  });

  it('transient network error → keeps the local replica, runs offline (never wiped, never reopened)', async () => {
    const { infoPath } = plantReplicaFiles();
    syncBehaviours = ['network']; // not a divergence — must NOT trigger a destructive wipe

    await expect(db.initStore()).resolves.toBeUndefined();

    // Same client kept — no reopen, no re-pull.
    expect(createdClients).toBe(1);
    // The replica and its sync metadata are preserved for the next online run.
    expect(existsSync(infoPath)).toBe(true);
    expect(db.getModelData()).toEqual({});
  });
});
