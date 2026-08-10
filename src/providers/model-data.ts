/**
 * @role Public API layer for all per-model data: the provider catalog (display name, context window), favorites, native-tools state, per-model settings, eval run records, and observed rate limits. Keyed by `"provider:modelId"`. All public function signatures are synchronous; reads hit the `db.ts` in-memory cache and writes update the cache then fire-and-forget persist to the DB.
 *
 * @readwhen
 * - Changing favorites, removal, or native-tools state per `"provider:modelId"` key.
 * - Adding persisted per-model settings (temperature, reasoning effort) overrides.
 * - Debugging eval run recording, humaneval pass/fail derivation, or observed rate limits.
 */

import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { OverridableSettings } from './types.js';
import { getModelData, setModelData, saveTranscriptAsync, persistModelRowAsync, persistModelCatalogAsync, type ModelCatalogRow } from '../store/db.js';
import { registerModelSettings } from './model-settings-accessor.js';

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
  removed?: boolean;
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
  return getModelData() ?? {};
}

function save(store: Record<string, ModelEntry>, changedKeys?: string[]): void {
  setModelData(store);
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

export function getRemovedKeys(): Set<string> {
  const store = load();
  const removed = new Set<string>();
  for (const [key, entry] of Object.entries(store)) {
    if (entry.removed) removed.add(key);
  }
  return removed;
}

export function setRemoved(key: string, removed: boolean): void {
  const store = load();
  const { provider, modelId } = splitKey(key);
  store[key] = { ...store[key], provider, modelId, removed };
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

registerModelSettings(getModelSettings);

export function setModelSetting(key: string, field: keyof OverridableSettings, value: boolean | number | undefined): void {
  const store = load();
  const { provider, modelId } = splitKey(key);
  const existing: Record<string, boolean | number> = { ...(store[key]?.settings as Record<string, boolean | number> | undefined) };
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
    if (!existing || run.timestamp >= existing.timestamp) latestByTask.set(run.taskId, run);
  }
  const results: Record<string, 'pass' | 'fail'> = {};
  for (const [taskId, run] of latestByTask) {
    results[taskId] = run.pass ? 'pass' : 'fail';
  }
  return results;
}

/** The registry's view of one model, as stored in the catalog columns. */
export interface CatalogModel {
  modelId: string;
  displayName: string;
  contextWindow?: number;
}

/**
 * Write the provider catalog (display name + context window) for one provider into
 * the store. This is the DB's copy of what the provider says exists; user state on
 * the same row is untouched — this writer touches only `display_name` and
 * `context_window`, and the user-state writers never touch those two. Rows whose
 * catalog values already match are skipped, so a launch with an unchanged model
 * list writes nothing, and the changed rows go out as one batched
 * `persistModelCatalogAsync` rather than a sync per row.
 *
 * Callers pass the provider's *final* model list, so blocklisted models never get a
 * row. Models the provider has stopped offering keep theirs.
 */
export function saveProviderCatalog(provider: string, models: CatalogModel[]): void {
  const store = load();
  const changed: ModelCatalogRow[] = [];
  for (const m of models) {
    const key = `${provider}:${m.modelId}`;
    const entry = store[key];
    if (entry?.displayName === m.displayName && (entry.contextWindow ?? undefined) === m.contextWindow) continue;
    store[key] = { ...entry, provider, modelId: m.modelId, displayName: m.displayName, contextWindow: m.contextWindow ?? null };
    changed.push({ key, provider, modelId: m.modelId, displayName: m.displayName, contextWindow: m.contextWindow });
  }
  if (changed.length === 0) return;
  setModelData(store);
  persistModelCatalogAsync(changed);
}

/**
 * The stored catalog for one provider. Feeds the registry's offline path: when a
 * live fetch fails, the model list is rebuilt from here rather than from the
 * on-disk JSON cache, which tracks only ids.
 */
export function getProviderCatalog(provider: string): CatalogModel[] {
  const models: CatalogModel[] = [];
  for (const entry of Object.values(load())) {
    if (entry.provider !== provider || !entry.displayName) continue;
    models.push({
      modelId: entry.modelId,
      displayName: entry.displayName,
      ...(entry.contextWindow != null ? { contextWindow: entry.contextWindow } : {}),
    });
  }
  return models;
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
