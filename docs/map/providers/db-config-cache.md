# src/providers/db-config-cache.ts - DB Config Cache

**Role:** Thin shared module holding the in-memory DB config cache and callback hooks. Exists to break the potential circular import between `db.ts` (which owns the libSQL client) and `config/index.ts` (which needs to read DB-sourced config values). Neither file imports the other; both import this one.

## Exports

```typescript
type SyncableGlobalConfig = {
  toolRationale?: boolean; showProviderUsage?: boolean; parallelTools?: boolean;
  toolConfirmation?: 'ask' | 'auto'; retryMaxWaitSeconds?: number;
  showEvalDots?: boolean; diffContextLines?: number; defaultModel?: string;
  loadAgentsMd?: boolean;
};

interface DbConfigData {
  global: SyncableGlobalConfig | null;         // null = no 'global' row in DB yet
  providerOverrides: Record<string, OverridableSettings> | null;  // null = no row yet
}

getDbConfigCache(): DbConfigData | null        // read the in-memory cache
setDbConfigCache(data: DbConfigData): void     // replace cache + trigger invalidator
clearDbConfigCache(): void                     // null out cache + trigger invalidator

registerCacheInvalidator(fn: () => void): void // config/index.ts registers (() => { cachedConfig = null })
registerConfigPersist(fn): void                // db.ts registers its fire-and-forget persist helper
persistDbConfig(scope, data): void             // config/index.ts calls this to push writes to DB
```

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
