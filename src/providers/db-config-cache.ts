import type { OverridableSettings } from './types.js';

export type SyncableGlobalConfig = {
  toolRationale?: boolean;
  showProviderUsage?: boolean;
  parallelTools?: boolean;
  toolConfirmation?: 'ask' | 'auto';
  retryMaxWaitSeconds?: number;
  showEvalDots?: boolean;
  diffContextLines?: number;
  defaultModel?: string;
  loadAgentsMd?: boolean;
};

export interface DbConfigData {
  /** null = no 'global' row exists in DB yet (never written) */
  global: SyncableGlobalConfig | null;
  /** null = no 'providerOverrides' row exists in DB yet (never written) */
  providerOverrides: Record<string, OverridableSettings> | null;
}

let dbConfigCache: DbConfigData | null = null;
let _onCacheChanged: (() => void) | null = null;
let _persistFn: ((scope: string, data: unknown) => void) | null = null;

export function getDbConfigCache(): DbConfigData | null {
  return dbConfigCache;
}

export function setDbConfigCache(data: DbConfigData): void {
  dbConfigCache = data;
  _onCacheChanged?.();
}

export function clearDbConfigCache(): void {
  dbConfigCache = null;
  _onCacheChanged?.();
}

/** config/index.ts registers this so writeConfigFile() flushes cachedConfig when DB config changes. */
export function registerCacheInvalidator(fn: () => void): void {
  _onCacheChanged = fn;
}

/** db.ts registers its fire-and-forget persist helper after initStore(). */
export function registerConfigPersist(fn: (scope: string, data: unknown) => void): void {
  _persistFn = fn;
}

/** config/index.ts calls this in writeConfigFile() to push changes to the DB. */
export function persistDbConfig(scope: string, data: unknown): void {
  _persistFn?.(scope, data);
}
