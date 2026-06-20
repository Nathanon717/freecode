import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { OverridableSettings } from './types.js';
import { getCache, setCache, saveTranscriptAsync, persistModelRowAsync } from './db.js';

interface EvalCheck { name: string; kind: string; pass?: boolean; message?: string; value?: string | number; note?: string; }

export interface EvalRunSummary {
  timestamp: string;
  taskId: string;
  pass: boolean;
  turns: number;
  tokenUsage: { input?: number; output?: number };
  totalTokens?: number;
  durationMs: number;
  error: string | null;
  warnings?: boolean;
  scenarioHash?: string;
  checks?: EvalCheck[];
}

/**
 * Public API layer for all per-model data. Keyed by `"provider:modelId"`.
 * All public functions are synchronous; persistence is via the `db.ts` in-memory cache.
 */

export interface ObservedRateLimitBucket {
  limit: number;
  intervalMs: number | null;
}

export interface ObservedRateLimits {
  buckets: Record<string, ObservedRateLimitBucket>;
  observedAt: string;
}

export interface ModelEntry {
  provider: string;
  modelId: string;
  displayName?: string;
  nativeTools?: boolean;
  contextWindow?: number | null;
  isFavorite?: boolean;
  settings?: OverridableSettings;
  evals?: { [evalType: string]: EvalRunSummary[] };
  rateLimits?: ObservedRateLimits;
}

const _dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(_dirname, '..', '..');

export function getStoreDir(): string {
  return process.env.FREECODE_STORE ?? join(PACKAGE_ROOT, '.freecode');
}

function load(): Record<string, ModelEntry> {
  return getCache() ?? {};
}

function save(store: Record<string, ModelEntry>, changedKeys?: string[]): void {
  setCache(store);
  if (changedKeys) {
    for (const key of changedKeys) {
      const entry = store[key];
      if (entry) persistModelRowAsync(key, entry);
    }
  }
}

function splitKey(key: string): { provider: string; modelId: string } {
  const colonIdx = key.indexOf(':');
  return {
    provider: colonIdx !== -1 ? key.slice(0, colonIdx) : '',
    modelId: colonIdx !== -1 ? key.slice(colonIdx + 1) : key,
  };
}

export function getModel(key: string): ModelEntry | undefined {
  return load()[key];
}

export function upsertModel(entry: ModelEntry): void {
  const store = load();
  const key = `${entry.provider}:${entry.modelId}`;
  store[key] = { ...store[key], ...entry };
  save(store, [key]);
}

export function getFavorites(): Set<string> {
  const store = load();
  const favs = new Set<string>();
  for (const [key, entry] of Object.entries(store)) {
    if (entry.isFavorite) favs.add(key);
  }
  return favs;
}

export function setFavorite(key: string, isFavorite: boolean): void {
  const store = load();
  const { provider, modelId } = splitKey(key);
  store[key] = { ...store[key], provider, modelId, isFavorite };
  save(store, [key]);
}

export function setNativeTools(provider: string, modelId: string, value: boolean): void {
  const store = load();
  const key = `${provider}:${modelId}`;
  store[key] = { ...store[key], provider, modelId, nativeTools: value };
  save(store, [key]);
}

export function isNativeToolsDisabled(provider: string, modelId: string): boolean {
  return load()[`${provider}:${modelId}`]?.nativeTools === false;
}

export function getNoNativeToolsKeys(): Set<string> {
  const store = load();
  const keys = new Set<string>();
  for (const [key, entry] of Object.entries(store)) {
    if (entry.nativeTools === false) keys.add(key);
  }
  return keys;
}

export function getModelSettings(key: string): OverridableSettings {
  return load()[key]?.settings ?? {};
}

export function setModelSetting(key: string, field: keyof OverridableSettings, value: boolean | undefined): void {
  const store = load();
  const { provider, modelId } = splitKey(key);
  const existing: Record<string, boolean> = { ...(store[key]?.settings as Record<string, boolean> | undefined) };
  if (value === undefined) {
    delete existing[field];
  } else {
    existing[field] = value;
  }
  store[key] = { ...store[key], provider, modelId, settings: existing };
  save(store, [key]);
}

interface EvalDoc {
  pass: boolean;
  failReason?: string;
  freecodeVersion: null;
  transcript: unknown[];
  scoringOutcome: unknown;
}

/**
 * Append one eval run to the store. Writes the summary into the in-memory cache and
 * persists the full transcript to `eval_runs`/`eval_transcripts` in the DB via
 * `saveTranscriptAsync` (fire-and-forget, syncs cross-device via Turso).
 */
export function appendEvalRun(
  key: string,
  evalType: string,
  summary: EvalRunSummary,
  doc: EvalDoc,
): void {
  const { provider, modelId } = splitKey(key);
  saveTranscriptAsync(key, evalType, summary, doc.failReason, doc.transcript, doc.scoringOutcome);
  const store = load();
  const entry = store[key] ?? { provider, modelId };
  const evals = entry.evals ?? {};
  const runs = evals[evalType] ?? [];
  runs.push(summary);
  store[key] = { ...entry, evals: { ...evals, [evalType]: runs } };
  // Persist the model row (changedKeys), not just the in-memory cache. Without this the
  // eval_runs row is written but the models row is not, so loadFromDb's `if (!entry) continue`
  // silently drops the eval on the next reinit/cross-device sync.
  save(store, [key]);
}

/**
 * Derive the latest pass/fail per taskId for humaneval runs from the store.
 * Runs where `error !== null` (crashes, python-not-found, etc.) are excluded
 * so a crash does not wipe a prior pass/fail dot.
 */
export function getHumanEvalResults(key: string): Record<string, 'pass' | 'fail'> {
  const runs = load()[key]?.evals?.['humaneval'] ?? [];
  const latestByTask = new Map<string, EvalRunSummary>();
  for (const run of runs) {
    if (run.error !== null) continue;
    const existing = latestByTask.get(run.taskId);
    if (!existing || run.timestamp > existing.timestamp) latestByTask.set(run.taskId, run);
  }
  const results: Record<string, 'pass' | 'fail'> = {};
  for (const [taskId, run] of latestByTask) {
    results[taskId] = run.pass ? 'pass' : 'fail';
  }
  return results;
}

/**
 * Persist observed rate limit buckets to the store for the given model.
 * No-op if the limit values are identical to what's already stored.
 */
export function saveObservedRateLimits(
  provider: string,
  modelId: string,
  buckets: Record<string, ObservedRateLimitBucket>,
): void {
  if (Object.keys(buckets).length === 0) return;
  const key = `${provider}:${modelId}`;
  const store = load();
  const existing = store[key]?.rateLimits;
  if (existing) {
    const allSame = Object.entries(buckets).every(([name, b]) => existing.buckets[name]?.limit === b.limit) &&
      Object.keys(existing.buckets).every(name => name in buckets);
    if (allSame) return;
  }
  const entry = store[key] ?? { provider, modelId };
  store[key] = { ...entry, rateLimits: { buckets, observedAt: new Date().toISOString() } };
  save(store, [key]);
}
