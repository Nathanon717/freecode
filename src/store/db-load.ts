/**
 * @role Reads the DB into the shapes the app holds in memory — the model-data map and the config blob.
 *
 * @readwhen
 * adding a column to `models`/`eval_runs` that must reach `ModelEntry`, or changing how a stored blob is decoded.
 */

import type { Client } from '@libsql/client';
import type { ModelEntry, EvalRunSummary } from '../providers/model-data.js';
import type { DbConfigData } from './db-config-cache.js';
import type { ModelDataMap } from './db-types.js';

/**
 * Reads the DB into the shapes the rest of the app holds in memory: the model-data
 * map and the config blob. Pure hydration — takes a client, returns plain data, owns
 * no state. Every column decode (null handling, JSON blobs, corrupt-row tolerance)
 * lives here so `db.ts` keeps only client lifecycle and writes.
 */

export async function loadFromDb(c: Client): Promise<ModelDataMap> {
  const [modelsRes, evalsRes] = await Promise.all([
    c.execute(
      'SELECT key, provider, model_id, display_name, native_tools, context_window, is_favorite, settings, rate_limits, removed FROM models'
    ),
    c.execute(
      'SELECT model_key, task_id, eval_type, timestamp, pass, turns, input_tokens, output_tokens, total_tokens, duration_ms, warnings, scenario_hash, checks, error FROM eval_runs ORDER BY timestamp ASC, id ASC'
    ),
  ]);

  const store: ModelDataMap = {};

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
    entry.removed = (row['removed'] as number) !== 0;
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

export async function loadConfigFromDb(c: Client): Promise<DbConfigData> {
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
