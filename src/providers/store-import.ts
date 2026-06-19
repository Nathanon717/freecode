import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Client, InStatement, InValue } from '@libsql/client';
import { log, logError } from '../logger.js';
import type { ModelEntry } from './model-store.js';
import type { EvalHistoryEntry } from '../cli/eval-dots.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(_dirname, '..', '..');

function getStoreDir(): string {
  return process.env.FREECODE_STORE ?? join(PACKAGE_ROOT, '.freecode');
}

export interface ImportResult {
  models: number;
  evalRuns: number;
  transcripts: number;
  skipped: boolean;
}

function splitKey(key: string): { provider: string; modelId: string } {
  const idx = key.indexOf(':');
  return {
    provider: idx !== -1 ? key.slice(0, idx) : '',
    modelId: idx !== -1 ? key.slice(idx + 1) : key,
  };
}

function walkJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walkJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) result.push(full);
  }
  return result;
}

/**
 * One-time import of legacy JSON data into libSQL.
 * No-op if models.json is absent (tests use temp FREECODE_STORE with no models.json)
 * or if the meta marker shows the import already ran.
 */
export async function importLegacyData(client: Client): Promise<ImportResult> {
  // Fast guard for tests: temp store has no models.json
  const storeDir = getStoreDir();
  const modelsPath = join(storeDir, 'models.json');
  if (!existsSync(modelsPath)) {
    return { models: 0, evalRuns: 0, transcripts: 0, skipped: true };
  }

  // Idempotency: meta marker set on previous successful run
  const metaRes = await client.execute(
    `SELECT value FROM meta WHERE key='import_done'`
  );
  if (metaRes.rows.length > 0) {
    return { models: 0, evalRuns: 0, transcripts: 0, skipped: true };
  }

  const result: ImportResult = { models: 0, evalRuns: 0, transcripts: 0, skipped: false };

  // ── Step 1: Read models.json ──────────────────────────────────────────────
  let modelsData: Record<string, ModelEntry> = {};
  try {
    modelsData = JSON.parse(readFileSync(modelsPath, 'utf-8')) as Record<string, ModelEntry>;
  } catch (err) {
    logError('db', 'store-import: failed to parse models.json', err);
  }

  // ── Step 2: Read playground/eval/results/*.json ───────────────────────────
  const resultsDir = join(PACKAGE_ROOT, 'playground', 'eval', 'results');
  const playgroundEntries: Array<{ entry: EvalHistoryEntry }> = [];
  if (existsSync(resultsDir)) {
    for (const fname of readdirSync(resultsDir)) {
      if (!fname.endsWith('.json')) continue;
      try {
        const parsed = JSON.parse(
          readFileSync(join(resultsDir, fname), 'utf-8')
        ) as EvalHistoryEntry[];
        for (const e of parsed) {
          if (e.model && e.model !== 'default' && e.model.includes(':')) {
            playgroundEntries.push({ entry: e });
          }
        }
      } catch (err) {
        logError('db', `store-import: failed to parse ${fname}`, err);
      }
    }
  }

  // ── Step 3: Build + flush model rows ─────────────────────────────────────
  const modelStmts: InStatement[] = [];
  const seenModels = new Set<string>();

  for (const [key, entry] of Object.entries(modelsData)) {
    seenModels.add(key);
    modelStmts.push({
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
    result.models++;
  }

  // Stub rows for playground models not in models.json
  for (const { entry: e } of playgroundEntries) {
    if (!seenModels.has(e.model)) {
      seenModels.add(e.model);
      const { provider, modelId } = splitKey(e.model);
      modelStmts.push({
        sql: `INSERT OR IGNORE INTO models (key, provider, model_id, is_favorite) VALUES (?, ?, ?, 0)`,
        args: [e.model, provider, modelId] as InValue[],
      });
      result.models++;
    }
  }

  if (modelStmts.length > 0) {
    await client.batch(modelStmts, 'write');
  }

  // ── Step 4: Flush eval_runs (playground first so hash fields survive) ─────
  // COALESCE upsert merges complementary fields:
  //   playground rows  → has scenario_hash, warnings, checks, total_tokens (no turns/duration)
  //   models.json rows → has turns, duration_ms, error (no scenario_hash/warnings/checks)
  const evalUpsertSql = `
    INSERT INTO eval_runs
      (model_key, eval_type, task_id, timestamp, pass,
       turns, input_tokens, output_tokens, total_tokens, duration_ms,
       warnings, scenario_hash, checks, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_key, eval_type, task_id, timestamp) DO UPDATE SET
      turns        = COALESCE(eval_runs.turns,        excluded.turns),
      duration_ms  = COALESCE(eval_runs.duration_ms,  excluded.duration_ms),
      warnings     = COALESCE(eval_runs.warnings,     excluded.warnings),
      scenario_hash= COALESCE(eval_runs.scenario_hash,excluded.scenario_hash),
      checks       = COALESCE(eval_runs.checks,       excluded.checks),
      error        = COALESCE(eval_runs.error,        excluded.error)
  `;

  const evalStmts: InStatement[] = [];

  // Playground entries
  for (const { entry: e } of playgroundEntries) {
    evalStmts.push({
      sql: evalUpsertSql,
      args: [
        e.model,
        'custom',
        e.scenarioId,
        e.timestamp,
        e.pass ? 1 : 0,
        null,
        e.tokens?.prompt ?? null,
        e.tokens?.output ?? null,
        e.tokens?.total ?? null,
        null,
        e.warnings ? 1 : 0,
        e.scenarioHash ?? null,
        e.checks ? JSON.stringify(e.checks) : null,
        null,
      ] as InValue[],
    });
    result.evalRuns++;
  }

  // models.json eval runs
  for (const [key, entry] of Object.entries(modelsData)) {
    for (const [evalType, runs] of Object.entries(entry.evals ?? {})) {
      for (const run of runs) {
        evalStmts.push({
          sql: evalUpsertSql,
          args: [
            key,
            evalType,
            run.taskId,
            run.timestamp,
            run.pass ? 1 : 0,
            run.turns ?? null,
            run.tokenUsage?.input ?? null,
            run.tokenUsage?.output ?? null,
            null,
            run.durationMs ?? null,
            null,
            null,
            null,
            run.error ?? null,
          ] as InValue[],
        });
        result.evalRuns++;
      }
    }
  }

  if (evalStmts.length > 0) {
    await client.batch(evalStmts, 'write');
  }

  // ── Step 5: Transcripts → eval_transcripts ────────────────────────────────
  const evalsDir = join(storeDir, 'evals');
  const transcriptFiles = walkJsonFiles(evalsDir);

  for (const filePath of transcriptFiles) {
    let doc: Record<string, unknown>;
    try {
      doc = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    const provider = doc['provider'] as string | undefined;
    const modelId = doc['modelId'] as string | undefined;
    const evalType = doc['evalType'] as string | undefined;
    const timestamp = doc['timestamp'] as string | undefined;
    if (!provider || !modelId || !evalType || !timestamp) continue;

    const modelKey = `${provider}:${modelId}`;
    let runId: number | null = null;
    try {
      const res = await client.execute({
        sql: `SELECT id FROM eval_runs WHERE model_key=? AND eval_type=? AND timestamp=? LIMIT 1`,
        args: [modelKey, evalType, timestamp] as InValue[],
      });
      if (res.rows.length > 0) runId = res.rows[0]!['id'] as number;
    } catch {
      continue;
    }
    if (runId === null) continue;

    try {
      await client.execute({
        sql: `INSERT OR IGNORE INTO eval_transcripts (run_id, fail_reason, transcript, scoring)
              VALUES (?, ?, ?, ?)`,
        args: [
          runId,
          (doc['failReason'] as string | undefined) ?? null,
          doc['transcript'] !== undefined ? JSON.stringify(doc['transcript']) : null,
          doc['scoringOutcome'] !== undefined ? JSON.stringify(doc['scoringOutcome']) : null,
        ] as InValue[],
      });
      result.transcripts++;
    } catch (err) {
      logError('db', `store-import: failed to insert transcript for run ${runId}`, err);
    }
  }

  // Mark import done
  await client.execute(`INSERT OR REPLACE INTO meta (key, value) VALUES ('import_done', '1')`);

  log('db', `store-import: imported ${result.models} models, ${result.evalRuns} eval runs, ${result.transcripts} transcripts`);
  return result;
}
