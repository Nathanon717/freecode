import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../config/index.js';
import { logError } from '../logger.js';

export interface RawCachedModel {
  id: string;
  displayName: string;
  contextWindow?: number;
}

interface ModelCacheEntry {
  fetchedAt: string;
  models: RawCachedModel[];
  newIds: string[];
  removedIds: string[];
}

type ModelCache = Record<string, ModelCacheEntry>;

const CONFIG_DIR = getConfigDir();
const CACHE_PATH = join(CONFIG_DIR, 'model-cache.json');

function load(): ModelCache {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    return JSON.parse(readFileSync(CACHE_PATH, 'utf-8')) as ModelCache;
  } catch (err) {
    logError('model-cache', 'Failed to load', err);
    return {};
  }
}

function save(cache: ModelCache): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    logError('model-cache', 'Failed to save', err);
  }
}

export function getProviderCache(providerId: string): ModelCacheEntry | null {
  return load()[providerId] ?? null;
}

export interface CacheUpdateResult {
  newIds: string[];
  removedIds: string[];
}

export function updateProviderCache(providerId: string, models: RawCachedModel[]): CacheUpdateResult {
  const cache = load();
  const prev = cache[providerId];

  const prevIds = new Set(prev?.models.map(m => m.id) ?? []);
  const nextIds = new Set(models.map(m => m.id));

  const newIds = models.filter(m => !prevIds.has(m.id)).map(m => m.id);
  const removedIds = (prev?.models ?? []).filter(m => !nextIds.has(m.id)).map(m => m.id);

  if (newIds.length === 0 && removedIds.length === 0) return { newIds: [], removedIds: [] };

  const existingNewIds = (prev?.newIds ?? []).filter(id => nextIds.has(id));
  const mergedNewIds = [...new Set([...existingNewIds, ...newIds])];

  cache[providerId] = {
    fetchedAt: new Date().toISOString(),
    models,
    newIds: mergedNewIds,
    removedIds,
  };

  save(cache);
  return { newIds, removedIds };
}

export function markModelSelected(providerId: string, modelId: string): void {
  const cache = load();
  const entry = cache[providerId];
  if (!entry || !entry.newIds.includes(modelId)) return;
  entry.newIds = entry.newIds.filter(id => id !== modelId);
  save(cache);
}
