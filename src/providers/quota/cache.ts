import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../../config/index.js';
import type { RateLimitSnapshot } from './headers.js';

type QuotaCacheFile = Record<string, { snapshot: RateLimitSnapshot; savedAt: number }>;

function getCachePath(): string {
  return join(getConfigDir(), 'quota-cache.json');
}

function readCacheFile(): QuotaCacheFile {
  try {
    const path = getCachePath();
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf-8')) as QuotaCacheFile;
  } catch {
    return {};
  }
}

export function loadCachedQuota(providerId: string): { snapshot: RateLimitSnapshot; savedAt: number } | null {
  const cache = readCacheFile();
  return cache[providerId] ?? null;
}

export function saveQuotaToCache(providerId: string, snapshot: RateLimitSnapshot): void {
  try {
    const dir = getConfigDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = getCachePath();
    const cache = readCacheFile();
    cache[providerId] = { snapshot, savedAt: Date.now() };
    writeFileSync(path, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Non-fatal: quota cache is best-effort
  }
}
