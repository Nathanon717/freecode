import { createClient, type Client, type InValue } from '@libsql/client';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { log, logError } from '../logger.js';
import type { ModelEntry, EvalRunSummary } from '../providers/model-data.js';
import { setDbConfigCache, clearDbConfigCache, registerConfigPersist, type DbConfigData } from './db-config-cache.js';
import type { LlmCallRow } from './call-log.js';
import { loadFromDb, loadConfigFromDb } from './db-load.js';
import type { ModelDataMap } from './db-types.js';
import { createSchema } from './db-schema.js';
import { getConfigMirrorPath, getDbUrl, getStoreDir, readDbConfig } from './store-paths.js';

/** One provider-catalog row: the registry's view of a model, no user state. */
export interface ModelCatalogRow {
  key: string;
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow?: number;
}

let client: Client | null = null;
let cache: ModelDataMap | null = null;

// libSQL replica sidecars. A recovery wipe MUST remove `-info` (sync metadata) or a
// WalConflict survives the re-pull; verified real dir has no `-meta`. See db.md.
const DB_FILE_SUFFIXES = ['', '-shm', '-wal', '-info', '-meta'] as const;

/** Remove the local db file and all its libSQL sidecars. Never throws. Exported for tests. */
export function wipeLocalDb(url: string): void {
  const dbPath = url.replace(/^file:/, '');
  for (const suffix of DB_FILE_SUFFIXES) {
    try { unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

/**
 * True for a libSQL WalConflict (diverged replica → wipe + re-pull); NOT transient
 * network/auth errors, which must not trigger a destructive wipe. Exported for tests. See db.md.
 */
export function isReplicaConflict(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /WalConflict/i.test(msg);
}

/** True when the db file at `url` is a libSQL embedded replica (has an `-info` sync-metadata sidecar). See db.md. */
function isSyncReplica(url: string): boolean {
  return existsSync(url.replace(/^file:/, '') + '-info');
}


// Tracks in-flight writes so resetStore() can drain them before closing.
const pendingWrites = new Set<Promise<void>>();

// Single promise chain — all writes are appended here so they execute one-at-a-time
// in submission order. This prevents multi-step chains (e.g. saveTranscriptAsync)
// from being interleaved with concurrent single-step writes, which caused the
// reentrancy/deadlock class seen on embedded-replica libSQL clients.
let writeChain: Promise<void> = Promise.resolve();

// Returns the queued promise so a caller that must know the write landed (see
// deleteModelRows) can await its turn on the chain. Fire-and-forget callers ignore it.
function enqueueWrite(task: () => Promise<void>): Promise<void> {
  // .then(task, task) ensures task runs even if a prior write somehow left the
  // chain in a rejected state (tasks catch internally, so this is defensive only).
  const p: Promise<void> = writeChain.then(task, task);
  pendingWrites.add(p);
  writeChain = p;
  void p.finally(() => pendingWrites.delete(p));
  return p;
}

/**
 * Synchronously write the DbConfigData to the file mirror.
 * Never throws — missing dir is created; all errors are swallowed.
 */
export function writeConfigMirror(data: DbConfigData): void {
  try {
    const dir = getStoreDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(getConfigMirrorPath(), JSON.stringify(data), 'utf-8');
  } catch { /* never throws */ }
}

/**
 * Synchronously prime the in-memory DbConfigCache from the file mirror.
 * No libSQL touched. Missing or corrupt file → silent no-op (cache untouched).
 * Call this at boot before the first loadConfig() to populate the cache from the
 * last-written mirror without blocking on libSQL initialisation.
 */
export function primeConfigCacheFromFile(): void {
  try {
    const path = getConfigMirrorPath();
    if (!existsSync(path)) return;
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as DbConfigData;
    setDbConfigCache(parsed);
  } catch { /* silent no-op */ }
}

/**
 * Persist a single model row. Fire-and-forget; serialized through writeChain.
 */
export function persistModelRowAsync(key: string, entry: ModelEntry): void {
  void enqueueWrite(async () => {
    try {
      await ensureStoreReady();
      const c = client;
      if (!c) return;
      await c.execute({
        sql: `INSERT INTO models
              (key, provider, model_id, display_name, native_tools, context_window,
               is_favorite, settings, rate_limits, removed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET
                provider       = excluded.provider,
                model_id       = excluded.model_id,
                display_name   = excluded.display_name,
                native_tools   = excluded.native_tools,
                context_window = excluded.context_window,
                is_favorite    = excluded.is_favorite,
                settings       = excluded.settings,
                rate_limits    = excluded.rate_limits,
                removed        = excluded.removed`,
        args: [
          key,
          entry.provider,
          entry.modelId,
          entry.displayName ?? null,
          entry.nativeTools === undefined ? null : (entry.nativeTools ? 1 : 0),
          entry.contextWindow ?? null,
          entry.isFavorite ? 1 : 0,
          entry.settings ? JSON.stringify(entry.settings) : null,
          entry.rateLimits ? JSON.stringify(entry.rateLimits) : null,
          entry.removed ? 1 : 0,
        ] as InValue[],
      });
      await c.sync().catch((err) => logError('db', 'sync after model upsert failed', err));
    } catch (err) {
      logError('db', 'Failed to persist model row', err);
    }
  });
}

/**
 * Upsert the provider catalog (display name + context window) for many models in
 * one batch. `persistModelRowAsync` syncs per row, which would mean hundreds of
 * syncs on startup; this writes every row in a single transaction and syncs once.
 * Only the two catalog columns are touched — user state on an existing row (favorite,
 * removed, settings, rate limits, native tools) is left alone by the conflict clause.
 */
export function persistModelCatalogAsync(rows: ModelCatalogRow[]): void {
  if (rows.length === 0) return;
  void enqueueWrite(async () => {
    try {
      await ensureStoreReady();
      const c = client;
      if (!c) return;
      await c.batch(
        rows.map((r) => ({
          sql: `INSERT INTO models (key, provider, model_id, display_name, context_window)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                  display_name   = excluded.display_name,
                  context_window = excluded.context_window`,
          args: [r.key, r.provider, r.modelId, r.displayName, r.contextWindow ?? null] as InValue[],
        })),
        'write'
      );
      await c.sync().catch((err) => logError('db', 'sync after catalog upsert failed', err));
    } catch (err) {
      logError('db', 'Failed to persist model catalog', err);
    }
  });
}

/**
 * Delete these model keys and every row that hangs off them. Awaited, not
 * fire-and-forget: the only caller gates it on a user confirmation and must not
 * continue before the rows are gone. Returns `true` when the delete is durable.
 *
 * The children are deleted explicitly, oldest-descendant first, because nothing in
 * the schema cascades: `eval_runs.model_key` and `eval_transcripts.run_id` are plain
 * REFERENCES with no ON DELETE clause, so with `PRAGMA foreign_keys = ON` a parent
 * delete would be rejected outright, and `llm_calls.model_key` is not a foreign key
 * at all, so its rows would simply be orphaned. One batch, so a failure part-way
 * leaves the DB untouched rather than half-deleted.
 *
 * Durability on a synced replica: the delete is written **straight to the primary**
 * via a throwaway remote client, then pulled local — NOT applied to the local replica
 * and pushed on `sync()`. A local-replica delete is an un-pushed WAL frame, and the
 * catalog upserts every launch keep advancing the remote, so that frame perpetually
 * loses the push race and is discarded by the next launch's WalConflict wipe-and-
 * re-pull — the deleted row comes back from the primary and the blocklist-purge prompt
 * recurs forever (a model the provider no longer serves can never be re-filtered away,
 * so it loops indefinitely). Writing to the primary sidesteps the race entirely. See db.md.
 */
export async function deleteModelRows(keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  await ensureStoreReady();
  let durable = true;
  await enqueueWrite(async () => {
    const placeholders = keys.map(() => '?').join(', ');
    const args: InValue[] = keys;
    const stmts = [
      { sql: `DELETE FROM eval_transcripts WHERE run_id IN (SELECT id FROM eval_runs WHERE model_key IN (${placeholders}))`, args },
      { sql: `DELETE FROM eval_runs WHERE model_key IN (${placeholders})`, args },
      { sql: `DELETE FROM llm_calls WHERE model_key IN (${placeholders})`, args },
      { sql: `DELETE FROM models WHERE key IN (${placeholders})`, args },
    ];

    const { syncUrl, authToken } = readDbConfig();
    if (syncUrl && authToken) {
      // Synced: delete on the primary so it can't be conflict-wiped, then pull it local.
      const remote = createClient({ url: syncUrl, authToken });
      try {
        await remote.batch(stmts, 'write');
        if (client) await client.sync().catch((err) => logError('db', 'sync after primary delete failed', err));
      } catch (err) {
        logError('db', 'Failed to delete model rows on primary', err);
        durable = false;
      } finally {
        remote.close();
      }
    } else if (client) {
      // Local-only store (no sync configured): a plain local delete is already durable.
      try {
        await client.batch(stmts, 'write');
      } catch (err) {
        logError('db', 'Failed to delete model rows', err);
        durable = false;
      }
    }

    // Reflect the delete in the in-memory cache so the running session stops offering
    // the rows even if the durable write failed (it will be retried next launch).
    if (cache) {
      const next = { ...cache };
      for (const key of keys) delete next[key];
      cache = next;
    }
  });
  return durable;
}

/** One row per LLM HTTP call. Fire-and-forget; serialized through writeChain. */
export function persistCallLogAsync(row: LlmCallRow): void {
  void enqueueWrite(async () => {
    try {
      await ensureStoreReady();
      const c = client;
      if (!c) return;
      await c.execute({
        sql: `INSERT INTO llm_calls
              (model_key, timestamp, status, input_tokens, output_tokens, total_tokens, error)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          row.modelKey,
          row.timestamp,
          row.status ?? null,
          row.inputTokens ?? null,
          row.outputTokens ?? null,
          row.totalTokens ?? null,
          row.error ?? null,
        ] as InValue[],
      });
      await c.sync().catch((err) => logError('db', 'sync after call-log insert failed', err));
    } catch (err) {
      logError('db', 'Failed to persist call log row', err);
    }
  });
}

function persistDbConfigRowAsync(scope: string, data: unknown): void {
  void enqueueWrite(async () => {
    try {
      await ensureStoreReady();
      const c = client;
      if (!c) return;
      await c.execute({
        sql: `INSERT INTO config (scope, data) VALUES (?, ?)
              ON CONFLICT(scope) DO UPDATE SET data = excluded.data`,
        args: [scope, JSON.stringify(data)] as InValue[],
      });
      await c.sync().catch((err) => logError('db', 'sync after config upsert failed', err));
    } catch (err) {
      logError('db', 'Failed to persist config row', err);
    }
  });
}

export function saveTranscriptAsync(
  modelKey: string,
  evalType: string,
  summary: EvalRunSummary,
  failReason: string | undefined,
  transcript: unknown,
  scoringOutcome: unknown,
): void {
  void enqueueWrite(async () => {
    try {
      await ensureStoreReady();
      const c = client;
      if (!c) return;
      // eval_runs.model_key references models(key) (FK enforced). Insert a minimal parent
      // row via INSERT OR IGNORE so loadFromDb — which skips eval rows with no matching
      // models entry — doesn't silently drop this eval. persistModelRowAsync's later
      // upsert fills the remaining columns.
      const colonIdx = modelKey.indexOf(':');
      const provider = colonIdx !== -1 ? modelKey.slice(0, colonIdx) : '';
      const modelId = colonIdx !== -1 ? modelKey.slice(colonIdx + 1) : modelKey;
      await c.execute({
        sql: `INSERT OR IGNORE INTO models (key, provider, model_id) VALUES (?, ?, ?)`,
        args: [modelKey, provider, modelId] as InValue[],
      });

      const runRes = await c.execute({
        sql: `INSERT INTO eval_runs
              (model_key, eval_type, task_id, timestamp, pass, turns,
               input_tokens, output_tokens, total_tokens, duration_ms,
               warnings, scenario_hash, checks, error)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          modelKey, evalType, summary.taskId, summary.timestamp,
          summary.pass ? 1 : 0,
          summary.turns ?? null,
          summary.tokenUsage.input ?? null,
          summary.tokenUsage.output ?? null,
          summary.totalTokens ?? null,
          summary.durationMs ?? null,
          summary.warnings !== undefined ? (summary.warnings ? 1 : 0) : null,
          summary.scenarioHash ?? null,
          summary.checks !== undefined ? JSON.stringify(summary.checks) : null,
          summary.error,
        ] as InValue[],
      });
      const runId = Number(runRes.lastInsertRowid);

      await c.execute({
        sql: `INSERT INTO eval_transcripts (run_id, fail_reason, transcript, scoring) VALUES (?, ?, ?, ?)`,
        args: [
          runId,
          failReason ?? null,
          transcript !== undefined ? JSON.stringify(transcript) : null,
          scoringOutcome !== undefined ? JSON.stringify(scoringOutcome) : null,
        ] as InValue[],
      });
      await c.sync().catch((err) => logError('db', 'sync after transcript insert failed', err));
    } catch (err) {
      logError('db', 'Failed to persist transcript', err);
    }
  });
}

export function getDbSyncConfig(): { syncUrl?: string; authToken?: string } {
  return readDbConfig();
}

let initPromise: Promise<void> | null = null;

/** Open a synced embedded-replica client, wiping stale sync metadata once if creation fails. */
function openSyncedClient(url: string, syncUrl: string, authToken: string): Client {
  try {
    return createClient({ url, syncUrl, authToken });
  } catch {
    // Local db lacks libsql sync metadata (created before sync was configured) — wipe and retry.
    wipeLocalDb(url);
    return createClient({ url, syncUrl, authToken });
  }
}

/**
 * Open the client, pull from remote, and create the schema. On a WalConflict discard
 * the diverged replica and re-pull once (drops un-pushed writes — only eval history is
 * a real loss). Transient sync errors keep the replica and run offline. See db.md.
 */
async function openAndPrepareClient(): Promise<void> {
  const { syncUrl, authToken } = readDbConfig();
  const url = getDbUrl();

  if (!(syncUrl && authToken)) {
    // Opening an existing sync replica as a plain client corrupts its sync metadata and
    // forces a re-bootstrap next tokened run. Decline (leave `client` null) to preserve it. See db.md.
    if (isSyncReplica(url)) {
      log('db', 'Tokenless run over a sync replica; skipping local open to preserve replica sync metadata');
      return;
    }
    client = createClient({ url });
    await createSchema(client);
    return;
  }

  client = openSyncedClient(url, syncUrl, authToken);
  try {
    await client.sync();
    await createSchema(client);
  } catch (err) {
    if (isReplicaConflict(err)) {
      logError('db', 'Local replica diverged (WalConflict); wiping and re-pulling from remote', err);
      try { client.close(); } catch { /* ignore */ }
      wipeLocalDb(url);
      client = openSyncedClient(url, syncUrl, authToken);
      await client.sync();
      await createSchema(client);
    } else {
      // Network/auth/timeout: keep the local replica and run offline.
      logError('db', 'Initial sync failed, continuing offline', err);
      await createSchema(client);
    }
  }
}

async function doInit(): Promise<void> {
  try {
    await openAndPrepareClient();
    if (client) {
      cache = await loadFromDb(client);
      const dbConfigData = await loadConfigFromDb(client);
      setDbConfigCache(dbConfigData);
      writeConfigMirror(dbConfigData);
    } else if (cache === null) {
      // Declined open (tokenless run over a sync replica): calm degrade, NOT the error branch. See db.md.
      cache = {};
    }
  } catch (err) {
    // The store is best-effort: a failed init must NEVER crash the interactive
    // menus that await ensureStoreReady() (a thrown error here would also poison
    // the memoized initPromise, breaking every later menu open). Degrade to an
    // empty in-memory cache with no client so reads return empty and writes no-op;
    // the config cache primed from config-cache.json at boot is left untouched.
    logError('db', 'Store init failed; continuing without persistence', err);
    try { client?.close(); } catch { /* ignore */ }
    client = null;
    if (cache === null) cache = {};
  }
  registerConfigPersist(persistDbConfigRowAsync);
}

/** Idempotent — multiple callers share a single init promise. */
export function initStore(): Promise<void> {
  return (initPromise ??= doInit());
}

/** Semantic alias for lazy call sites. Memoized — free after first init. */
export const ensureStoreReady = initStore;

/** Drain all pending fire-and-forget writes. Call at graceful shutdown before process exit. */
export async function drainPendingWrites(): Promise<void> {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
}

/** Reset state — for tests only. Drains in-flight writes before closing. */
export async function resetStore(): Promise<void> {
  while (pendingWrites.size) await Promise.all([...pendingWrites]);
  pendingWrites.clear();
  client?.close();
  client = null;
  cache = null;
  initPromise = null;
  clearDbConfigCache();
  // Windows SQLite WAL files need a moment to be released by the OS after close().
  if (process.platform === 'win32') await new Promise(r => setTimeout(r, 100));
}

export function getModelData(): ModelDataMap | null {
  return cache;
}

export function setModelData(store: ModelDataMap): void {
  cache = store;
}

/** For testing only: read rows via raw SQL. Separate from executeRawForTesting, whose
 * void return is itself asserted on. */
export async function queryRawForTesting(sql: string, args: InValue[] = []): Promise<Record<string, unknown>[]> {
  if (!client) throw new Error('DB not initialized');
  const res = await client.execute({ sql, args });
  return res.rows;
}

/** For testing only: execute raw SQL directly against the live client. */
export async function executeRawForTesting(sql: string, args: InValue[]): Promise<void> {
  if (!client) throw new Error('DB not initialized');
  await client.execute({ sql, args });
}
