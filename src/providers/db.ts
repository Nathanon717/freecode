import { createClient, type Client, type InValue } from '@libsql/client';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { logError } from '../logger.js';
import type { ModelEntry, EvalRunSummary } from './model-store.js';
import { importLegacyData } from './store-import.js';

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

function splitKey(key: string): { provider: string; modelId: string } {
  const idx = key.indexOf(':');
  return {
    provider: idx !== -1 ? key.slice(0, idx) : '',
    modelId: idx !== -1 ? key.slice(idx + 1) : key,
  };
}

async function createSchema(c: Client): Promise<void> {
  await c.execute(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
      checks         TEXT,
      UNIQUE(model_key, eval_type, task_id, timestamp)
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
      'SELECT model_key, task_id, eval_type, timestamp, pass, turns, input_tokens, output_tokens, total_tokens, duration_ms, warnings, scenario_hash, checks, error FROM eval_runs ORDER BY timestamp ASC'
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
      try { entry.settings = JSON.parse(row['settings'] as string); } catch { /* skip corrupt */ }
    }
    if (row['rate_limits'] !== null) {
      try { entry.rateLimits = JSON.parse(row['rate_limits'] as string); } catch { /* skip corrupt */ }
    }
    store[key] = entry;
  }

  for (const row of evalsRes.rows) {
    const key = row['model_key'] as string;
    const evalType = row['eval_type'] as string;
    const entry = store[key];
    if (!entry) continue;
    const { provider, modelId } = splitKey(key);
    const ts = row['timestamp'] as string;
    const tsSlug = ts.replace(/[:.]/g, '');
    const transcriptRef = `evals/${evalType}/${provider}-${modelId}/${tsSlug}.json`;
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
      transcriptRef,
      error: row['error'] as string | null,
      warnings: row['warnings'] !== null ? (row['warnings'] as number) !== 0 : undefined,
      scenarioHash: row['scenario_hash'] !== null ? (row['scenario_hash'] as string) : undefined,
      checks: row['checks'] !== null ? (() => { try { return JSON.parse(row['checks'] as string) as EvalRunSummary['checks']; } catch { return undefined; } })() : undefined,
    };
    if (!entry.evals) entry.evals = {};
    if (!entry.evals[evalType]) entry.evals[evalType] = [];
    entry.evals[evalType]!.push(summary);
  }

  return store;
}

// Track in-flight writes so resetStore() can drain them before closing.
const pendingWrites = new Set<Promise<void>>();

/**
 * Persist a single model row via one c.execute() INSERT OR REPLACE.
 * Fire-and-forget; never batches — avoids deadlocks on synced embedded replicas.
 */
export function persistModelRowAsync(key: string, entry: ModelEntry): void {
  const c = client;
  if (!c) return;

  let resolveFn!: () => void;
  const p: Promise<void> = new Promise(r => { resolveFn = r; });
  pendingWrites.add(p);

  void (async () => {
    try {
      await c.execute({
        sql: `INSERT OR REPLACE INTO models
              (key, provider, model_id, display_name, native_tools, context_window,
               is_favorite, settings, rate_limits)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      await c.sync().catch(() => {});
    } catch (err) {
      logError('db', 'Failed to persist model row', err);
    } finally {
      pendingWrites.delete(p);
      resolveFn();
    }
  })();
}

export function saveTranscriptAsync(
  modelKey: string,
  evalType: string,
  summary: EvalRunSummary,
  failReason: string | undefined,
  transcript: unknown,
  scoringOutcome: unknown,
): void {
  const c = client;
  if (!c) return;

  let resolveFn!: () => void;
  const p: Promise<void> = new Promise(r => { resolveFn = r; });
  pendingWrites.add(p);

  void (async () => {
    try {
      await c.execute({
        sql: `INSERT OR IGNORE INTO eval_runs
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

      const res = await c.execute({
        sql: `SELECT id FROM eval_runs WHERE model_key=? AND eval_type=? AND task_id=? AND timestamp=?`,
        args: [modelKey, evalType, summary.taskId, summary.timestamp] as InValue[],
      });
      const runId = res.rows[0]?.['id'] as number | undefined;
      if (runId === undefined) return;

      await c.execute({
        sql: `INSERT OR IGNORE INTO eval_transcripts (run_id, fail_reason, transcript, scoring) VALUES (?, ?, ?, ?)`,
        args: [
          runId,
          failReason ?? null,
          transcript !== undefined ? JSON.stringify(transcript) : null,
          scoringOutcome !== undefined ? JSON.stringify(scoringOutcome) : null,
        ] as InValue[],
      });
      await c.sync().catch(() => {});
    } catch (err) {
      logError('db', 'Failed to persist transcript', err);
    } finally {
      pendingWrites.delete(p);
      resolveFn();
    }
  })();
}

export function getDbSyncConfig(): { syncUrl?: string; authToken?: string } {
  return readDbConfig();
}

export async function initStore(): Promise<void> {
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
  await importLegacyData(client);
  cache = await loadFromDb(client);
}

/** Reset state — for tests only. Drains in-flight writes before closing. */
export async function resetStore(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
  pendingWrites.clear();
  client?.close();
  client = null;
  cache = null;
  // Windows SQLite WAL files need a moment to be released by the OS after close().
  await new Promise(r => setTimeout(r, 100));
}

export function getCache(): ModelStore | null {
  return cache;
}

export function setCache(store: ModelStore): void {
  cache = store;
}
