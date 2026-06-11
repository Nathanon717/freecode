import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getConfigDir, getConfigPaths, readRawConfig } from '../config/index.js';
import { logError } from '../logger.js';
import type { OverridableSettings } from './types.js';

export interface EvalRunSummary {
  timestamp: string;
  taskId: string;
  pass: boolean;
  turns: number;
  tokenUsage: { input?: number; output?: number };
  durationMs: number;
  transcriptRef: string;
  error: string | null;
}

/**
 * Unified, git-tracked store for per-model data. Owns `getStoreDir()`, the
 * `$FREECODE_STORE` override, and all reads/writes of `models.json`.
 *
 * Store key is `"provider:modelId"` (matches the model-preference string format).
 * All writes are plain file writes — no git calls anywhere.
 */

export interface ObservedRateLimitBucket {
  /** The ceiling value for this bucket as returned by the provider. */
  limit: number;
  /**
   * The time interval this limit applies to, in milliseconds.
   * - Mistral/Cerebras: fixed from header name (-minute=60000, -hour=3600000, -day=86400000)
   * - Anthropic: 60000 (per-minute rolling window)
   * - Groq/OpenAI: the reset-window duration observed at capture time (dynamic)
   * - null when the provider does not supply interval information
   */
  intervalMs: number | null;
}

export interface ObservedRateLimits {
  /**
   * Per-bucket observed limits from response headers.
   * Key examples: "requests", "tokens", "requests-per-minute", "requests-per-day",
   * "input-tokens", "output-tokens"
   */
  buckets: Record<string, ObservedRateLimitBucket>;
  /** ISO-8601 timestamp of when these limits were last observed from a real API response. */
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
  /** Rate limit ceilings observed from actual API response headers. Written once; only updated when values change. */
  rateLimits?: ObservedRateLimits;
}

type ModelStoreFile = Record<string, ModelEntry>;

const _dirname = dirname(fileURLToPath(import.meta.url));
// `model-store` lives at src/providers (dist/providers when compiled); two levels
// up is the package root, mirroring how humaneval.ts anchors to package root.
const PACKAGE_ROOT = resolve(_dirname, '..', '..');

export function getStoreDir(): string {
  return process.env.FREECODE_STORE ?? join(PACKAGE_ROOT, '.freecode');
}

function getModelsPath(): string {
  return join(getStoreDir(), 'models.json');
}

function load(): ModelStoreFile {
  const path = getModelsPath();
  try {
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf-8')) as ModelStoreFile;
  } catch (err) {
    logError('model-store', 'Failed to load', err);
    return {};
  }
}

function save(store: ModelStoreFile): void {
  try {
    mkdirSync(getStoreDir(), { recursive: true });
    writeFileSync(getModelsPath(), JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    logError('model-store', 'Failed to save', err);
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
  save(store);
}

/**
 * Seed favorites from the legacy `config.favoriteModels` field on the store's
 * first read. Gated on the store file not yet existing — once it exists (even
 * with zero favorites) we never consult the legacy source again. Read-once,
 * idempotent (see model-store-plan "Migration = per-category").
 */
function seedFavoritesIfNeeded(): void {
  if (existsSync(getModelsPath())) return;
  const { globalPath } = getConfigPaths();
  const raw = readRawConfig(globalPath) as Record<string, unknown> | null;
  const legacy = raw?.['favoriteModels'];
  if (!Array.isArray(legacy) || legacy.length === 0) return;

  const store: ModelStoreFile = {};
  for (const key of legacy as string[]) {
    const { provider, modelId } = splitKey(key);
    store[key] = { provider, modelId, isFavorite: true };
  }
  save(store);
}

export function getFavorites(): Set<string> {
  seedFavoritesIfNeeded();
  const store = load();
  const favs = new Set<string>();
  for (const [key, entry] of Object.entries(store)) {
    if (entry.isFavorite) favs.add(key);
  }
  return favs;
}

export function setFavorite(key: string, isFavorite: boolean): void {
  seedFavoritesIfNeeded();
  const store = load();
  const { provider, modelId } = splitKey(key);
  store[key] = { ...store[key], provider, modelId, isFavorite };
  save(store);
}

/**
 * Read the legacy `model-traits.json` no-native-tools list from `getConfigDir()`.
 * This is the only place that touches the orphaned legacy file; it is read solely
 * to seed `nativeTools: false` into the store on first read (see below).
 */
function loadLegacyNoNativeTools(): string[] {
  try {
    const path = join(getConfigDir(), 'model-traits.json');
    if (!existsSync(path)) return [];
    const data = JSON.parse(readFileSync(path, 'utf-8')) as { noNativeTools?: string[] };
    return Array.isArray(data.noNativeTools) ? data.noNativeTools : [];
  } catch (err) {
    logError('model-store', 'Failed to read legacy model-traits', err);
    return [];
  }
}

/**
 * Seed `nativeTools: false` from the legacy `model-traits.json` on first read.
 * Per-key and read-once: a key that already carries a `nativeTools` value (seeded
 * before, or written by runtime detection) is left untouched, so we never overwrite
 * a live value. Read-once, idempotent (see model-store-plan "Migration = per-category").
 */
function seedNativeToolsIfNeeded(): void {
  const legacy = loadLegacyNoNativeTools();
  if (legacy.length === 0) return;
  const store = load();
  let changed = false;
  for (const key of legacy) {
    if (store[key]?.nativeTools === undefined) {
      const { provider, modelId } = splitKey(key);
      store[key] = { ...store[key], provider, modelId, nativeTools: false };
      changed = true;
    }
  }
  if (changed) save(store);
}

export function setNativeTools(provider: string, modelId: string, value: boolean): void {
  const store = load();
  const key = `${provider}:${modelId}`;
  store[key] = { ...store[key], provider, modelId, nativeTools: value };
  save(store);
}

export function isNativeToolsDisabled(provider: string, modelId: string): boolean {
  seedNativeToolsIfNeeded();
  return load()[`${provider}:${modelId}`]?.nativeTools === false;
}

export function getNoNativeToolsKeys(): Set<string> {
  seedNativeToolsIfNeeded();
  const store = load();
  const keys = new Set<string>();
  for (const [key, entry] of Object.entries(store)) {
    if (entry.nativeTools === false) keys.add(key);
  }
  return keys;
}

/**
 * Seed per-model settings from the legacy `config.modelOverrides` field.
 * Runs once per process: when `modelOverrides` is found in config.json, all
 * keys are seeded into the store and the field is deleted from config.json so
 * subsequent reads never re-seed (even after the user clears all overrides).
 * Per-key guard prevents overwriting already-seeded entries.
 */
function seedAllModelSettingsIfNeeded(): void {
  const { globalPath } = getConfigPaths();
  const raw = readRawConfig(globalPath) as Record<string, unknown> | null;
  const modelOverrides = raw?.['modelOverrides'] as Record<string, OverridableSettings> | undefined;
  if (!modelOverrides || Object.keys(modelOverrides).length === 0) return;

  const store = load();
  for (const [key, legacySettings] of Object.entries(modelOverrides)) {
    if (store[key]?.settings !== undefined) continue;
    const { provider, modelId } = splitKey(key);
    store[key] = { ...store[key], provider, modelId, settings: { ...legacySettings } };
  }
  save(store);

  // Strip modelOverrides from config.json now that the store holds the values.
  const cleaned: Record<string, unknown> = { ...raw };
  delete cleaned['modelOverrides'];
  delete cleaned['preferLocal'];
  try {
    writeFileSync(globalPath, JSON.stringify(cleaned, null, 2), 'utf-8');
  } catch (err) {
    logError('model-store', 'Failed to clean legacy modelOverrides from config', err);
  }
}

export function getModelSettings(key: string): OverridableSettings {
  seedAllModelSettingsIfNeeded();
  return load()[key]?.settings ?? {};
}

export function setModelSetting(key: string, field: keyof OverridableSettings, value: boolean | undefined): void {
  seedAllModelSettingsIfNeeded();
  const store = load();
  const { provider, modelId } = splitKey(key);
  const existing: Record<string, boolean> = { ...(store[key]?.settings as Record<string, boolean> | undefined) };
  if (value === undefined) {
    delete existing[field];
  } else {
    existing[field] = value;
  }
  // Keep settings as {} (not undefined) so the seed guard remains inactive after all fields are cleared.
  store[key] = { ...store[key], provider, modelId, settings: existing };
  save(store);
}

interface EvalTranscriptDoc {
  provider: string;
  modelId: string;
  evalType: string;
  timestamp: string;
  pass: boolean;
  failReason?: string;
  freecodeVersion: null;
  transcript: unknown[];
  scoringOutcome: unknown;
}

/**
 * Append one eval run to the store. Writes the summary to `models.json` under
 * `entry.evals[evalType]` and the full transcript doc to
 * `evals/{evalType}/{provider}-{modelId}/{timestampSlug}.json`.
 * `transcriptRef` on the summary is computed here and must not be supplied by the caller.
 */
export function appendEvalRun(
  key: string,
  evalType: string,
  summary: Omit<EvalRunSummary, 'transcriptRef'>,
  doc: Omit<EvalTranscriptDoc, 'provider' | 'modelId' | 'evalType' | 'timestamp'>,
): void {
  const { provider, modelId } = splitKey(key);
  // Filename-safe timestamp: strip ':' and '.'
  const tsSlug = summary.timestamp.replace(/[:.]/g, '');
  const relPath = `evals/${evalType}/${provider}-${modelId}/${tsSlug}.json`;
  const absPath = join(getStoreDir(), relPath);

  try {
    mkdirSync(dirname(absPath), { recursive: true });
    const fullDoc: EvalTranscriptDoc = { provider, modelId, evalType, timestamp: summary.timestamp, ...doc };
    writeFileSync(absPath, JSON.stringify(fullDoc, null, 2), 'utf-8');
  } catch (err) {
    logError('model-store', 'Failed to write eval transcript', err);
  }

  const fullSummary: EvalRunSummary = { ...summary, transcriptRef: relPath };
  const store = load();
  const entry = store[key] ?? { provider, modelId };
  const evals = entry.evals ?? {};
  const runs = evals[evalType] ?? [];
  runs.push(fullSummary);
  store[key] = { ...entry, evals: { ...evals, [evalType]: runs } };
  save(store);
}

/**
 * Derive the latest pass/fail per taskId for humaneval runs from the store.
 * Runs where `error !== null` (crashes, python-not-found, etc.) are excluded
 * so a crash does not wipe a prior pass/fail dot — matching pre-Phase-4 UX.
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
 * Persist observed rate limit buckets to models.json for the given model.
 * No-op if the limit values are identical to what's already stored, preventing
 * constant writes on every response turn.
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
  save(store);
}
