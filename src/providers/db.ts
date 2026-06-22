import { createClient, type Client, type InValue } from '@libsql/client';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { logError } from '../logger.js';
import type { ModelEntry, EvalRunSummary } from './model-store.js';
import { setDbConfigCache, clearDbConfigCache, registerConfigPersist, type DbConfigData } from './db-config-cache.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(_dirname, '..', '..');

function getStoreDir(): string {
  return process.env.FREECODE_STORE ?? join(PACKAGE_ROOT, '.freecode');
}

function getDbUrl(): string {
  return `file:${join(getStoreDir(), 'freecode.db')}`;
}

function readDbConfig(): { syncUrl?: string; authToken?: string } {
  const syncUrl = process.env.FREECODE_DB_SYNC_URL ?? undefined;
  const authToken = process.env.FREECODE_DB_AUTH_TOKEN ?? undefined;
  if (syncUrl && authToken) return { syncUrl, authToken };
  try {
    const configDir = process.env.FREECODE_HOME ?? join(homedir(), '.config', 'freecode');
    const configPath = join(configDir, 'config.json');
    if (!existsSync(configPath)) return { syncUrl, authToken };
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const db = raw['db'] as Record<string, string> | undefined;
    return {
      syncUrl: db?.['syncUrl'] ?? syncUrl,
      authToken: db?.['authToken'] ?? authToken,
    };
  } catch {
    return { syncUrl, authToken };
  }
}

type ModelStore = Record<string, ModelEntry>;

let client: Client | null = null;
let cache: ModelStore | null = null;

async function createSchema(c: Client): Promise<void> {
  await c.execute('PRAGMA foreign_keys = ON');
  await c.execute(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS config (
      scope TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS models (
      key            TEXT PRIMARY KEY,
      provider       TEXT NOT NULL,
      model_id       TEXT NOT NULL,
      display_name   TEXT,
      native_tools   INTEGER,
      context_window INTEGER,
      is_favorite    INTEGER DEFAULT 0,
      settings       TEXT,
      rate_limits    TEXT
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS eval_runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      model_key      TEXT NOT NULL REFERENCES models(key),
      eval_type      TEXT NOT NULL,
      task_id        TEXT NOT NULL,
      timestamp      TEXT NOT NULL,
      pass           INTEGER NOT NULL,
      warnings       INTEGER,
      turns          INTEGER,
      input_tokens   INTEGER,
      output_tokens  INTEGER,
      total_tokens   INTEGER,
      duration_ms    INTEGER,
      scenario_hash  TEXT,
      error          TEXT,
      checks         TEXT
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS eval_transcripts (
      run_id      INTEGER PRIMARY KEY REFERENCES eval_runs(id),
      fail_reason TEXT,
      transcript  TEXT,
      scoring     TEXT
    )
  `);
}

async function loadFromDb(c: Client): Promise<ModelStore> {
  const [modelsRes, evalsRes] = await Promise.all([
    c.execute(
      'SELECT key, provider, model_id, display_name, native_tools, context_window, is_favorite, settings, rate_limits FROM models'
    ),
    c.execute(
      'SELECT model_key, task_id, eval_type, timestamp, pass, turns, input_tokens, output_tokens, total_tokens, duration_ms, warnings, scenario_hash, checks, error FROM eval_runs ORDER BY timestamp ASC, id ASC'
    ),
  ]);

  const store: ModelStore = {};

  for (const row of modelsRes.rows) {
    const key = row['key'] as string;
    const entry: ModelEntry = {
      provider: row['provider'] as string,
      modelId: row['model_id'] as string,
    };
    if (row['display_name'] !== null) entry.displayName = row['display_name'] as string;
    if (row['native_tools'] !== null) entry.nativeTools = (row['native_tools'] as number) !== 0;
    if (row['context_window'] !== null) entry.contextWindow = row['context_window'] as number;
    entry.isFavorite = (row['is_favorite'] as number) !== 0;
    if (row['settings'] !== null) {
      try { entry.settings = JSON.parse(row['settings'] as string) as ModelEntry['settings']; } catch { /* skip corrupt */ }
    }
    if (row['rate_limits'] !== null) {
      try { entry.rateLimits = JSON.parse(row['rate_limits'] as string) as ModelEntry['rateLimits']; } catch { /* skip corrupt */ }
    }
    store[key] = entry;
  }

  for (const row of evalsRes.rows) {
    const key = row['model_key'] as string;
    const evalType = row['eval_type'] as string;
    const entry = store[key];
    if (!entry) continue;
    const ts = row['timestamp'] as string;
    const summary: EvalRunSummary = {
      timestamp: ts,
      taskId: row['task_id'] as string,
      pass: (row['pass'] as number) !== 0,
      turns: row['turns'] as number,
      tokenUsage: {
        input: row['input_tokens'] !== null ? (row['input_tokens'] as number) : undefined,
        output: row['output_tokens'] !== null ? (row['output_tokens'] as number) : undefined,
      },
      totalTokens: row['total_tokens'] !== null ? (row['total_tokens'] as number) : undefined,
      durationMs: row['duration_ms'] as number,
      error: row['error'] as string | null,
      warnings: row['warnings'] !== null ? (row['warnings'] as number) !== 0 : undefined,
      scenarioHash: row['scenario_hash'] !== null ? (row['scenario_hash'] as string) : undefined,
      checks: row['checks'] !== null ? (() => { try { return JSON.parse(row['checks'] as string) as EvalRunSummary['checks']; } catch { return undefined; } })() : undefined,
    };
    if (!entry.evals) entry.evals = {};
    if (!entry.evals[evalType]) entry.evals[evalType] = [];
    entry.evals[evalType].push(summary);
  }

  return store;
}

async function loadConfigFromDb(c: Client): Promise<DbConfigData> {
  const res = await c.execute('SELECT scope, data FROM config');
  const result: DbConfigData = { global: null, providerOverrides: null };
  for (const row of res.rows) {
    const scope = row['scope'] as string;
    try {
      const parsed = JSON.parse(row['data'] as string) as unknown;
      if (scope === 'global') result.global = parsed as DbConfigData['global'];
      else if (scope === 'providerOverrides') result.providerOverrides = parsed as DbConfigData['providerOverrides'];
    } catch { /* skip corrupt row */ }
  }
  return result;
}

// Tracks in-flight writes so resetStore() can drain them before closing.
const pendingWrites = new Set<Promise<void>>();

// Single promise chain — all writes are appended here so they execute one-at-a-time
// in submission order. This prevents multi-step chains (e.g. saveTranscriptAsync)
// from being interleaved with concurrent single-step writes, which caused the
// reentrancy/deadlock class seen on embedded-replica libSQL clients.
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(task: () => Promise<void>): void {
  // .then(task, task) ensures task runs even if a prior write somehow left the
  // chain in a rejected state (tasks catch internally, so this is defensive only).
  const p: Promise<void> = writeChain.then(task, task);
  pendingWrites.add(p);
  writeChain = p;
  void p.finally(() => pendingWrites.delete(p));
}

/** Path to the config file mirror. */
function getConfigMirrorPath(): string {
  return join(getStoreDir(), 'config-cache.json');
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
  enqueueWrite(async () => {
    try {
      await ensureStoreReady();
      const c = client;
      if (!c) return;
      await c.execute({
        sql: `INSERT INTO models
              (key, provider, model_id, display_name, native_tools, context_window,
               is_favorite, settings, rate_limits)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(key) DO UPDATE SET
                provider       = excluded.provider,
                model_id       = excluded.model_id,
                display_name   = excluded.display_name,
                native_tools   = excluded.native_tools,
                context_window = excluded.context_window,
                is_favorite    = excluded.is_favorite,
                settings       = excluded.settings,
                rate_limits    = excluded.rate_limits`,
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
        ] as InValue[],
      });
      await c.sync().catch((err) => logError('db', 'sync after model upsert failed', err));
    } catch (err) {
      logError('db', 'Failed to persist model row', err);
    }
  });
}

function persistDbConfigRowAsync(scope: string, data: unknown): void {
  enqueueWrite(async () => {
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
  enqueueWrite(async () => {
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

async function doInit(): Promise<void> {
  const { syncUrl, authToken } = readDbConfig();
  const url = getDbUrl();

  if (syncUrl && authToken) {
    try {
      client = createClient({ url, syncUrl, authToken });
    } catch {
      // Local db lacks libsql sync metadata (created before sync was configured) — wipe and retry
      const dbPath = url.replace(/^file:/, '');
      for (const suffix of ['', '-shm', '-wal', '-meta']) {
        try { unlinkSync(dbPath + suffix); } catch { /* ignore */ }
      }
      client = createClient({ url, syncUrl, authToken });
    }
    try {
      await client.sync();
    } catch (err) {
      logError('db', 'Initial sync failed, continuing offline', err);
    }
  } else {
    client = createClient({ url });
  }

  await createSchema(client);
  cache = await loadFromDb(client);
  const dbConfigData = await loadConfigFromDb(client);
  setDbConfigCache(dbConfigData);
  writeConfigMirror(dbConfigData);
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

export function getCache(): ModelStore | null {
  return cache;
}

export function setCache(store: ModelStore): void {
  cache = store;
}

/** For testing only: execute raw SQL directly against the live client. */
export async function executeRawForTesting(sql: string, args: InValue[]): Promise<void> {
  if (!client) throw new Error('DB not initialized');
  await client.execute({ sql, args });
}
