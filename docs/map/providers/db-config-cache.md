# src/providers/db-config-cache.ts - DB Config Cache

**Role:** Thin shared module holding the in-memory DB config cache and callback hooks. Exists to break the potential circular import between `db.ts` (which owns the libSQL client) and `config/index.ts` (which needs to read DB-sourced config values). Neither file imports the other; both import this one.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type SyncableGlobalConfig = {
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

interface DbConfigData {
  /** null = no 'global' row exists in DB yet (never written) */
  global: SyncableGlobalConfig | null;
  /** null = no 'providerOverrides' row exists in DB yet (never written) */
  providerOverrides: Record<string, OverridableSettings> | null;
}

getDbConfigCache(): DbConfigData | null

setDbConfigCache(data: DbConfigData): void

clearDbConfigCache(): void

registerCacheInvalidator(fn: () => void): void

registerConfigPersist(fn: (scope: string, data: unknown) => void): void

persistDbConfig(scope: string, data: unknown): void
```
<!-- END GENERATED EXPORTS -->

## Lifecycle

- `db.ts` calls `setDbConfigCache()` in `initStore()` after loading the `config` table, and calls `clearDbConfigCache()` in `resetStore()`.
- `db.ts` calls `registerConfigPersist()` in `initStore()` to wire up the async DB write path.
- `config/index.ts` calls `registerCacheInvalidator()` at module load time so cache changes flush `cachedConfig`.
- `config/index.ts` calls `setDbConfigCache()` + `persistDbConfig()` synchronously in `writeConfigFile()` when writing the global config path.

## Read When

- Debugging config sync (global settings or provider overrides not propagating cross-device).
- Adding a new syncable config field.
- Tracing the circular-import avoidance pattern.

## Key Neighbors

- [providers/db.md](db.md): owns the libSQL client; writes to the `config` table via `persistDbConfigRowAsync`.
- [config/index.md](../config/index.md): reads from this cache in `loadConfig()`; writes to it in `writeConfigFile()`.

## Update Triggers

Update this page when `SyncableGlobalConfig` fields change, or when the callback pattern is extended.
