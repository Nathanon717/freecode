# src/store/db-config-cache.ts - DB Config Cache

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Thin shared module holding the in-memory DB config cache and callback hooks. Exists to break the potential circular import between `db.ts` (which owns the libSQL client) and `config/index.ts` (which needs to read DB-sourced config values). Neither file imports the other; both import this one.

## Read When

- Debugging config sync (global settings or provider overrides not propagating cross-device).
- Adding a new syncable config field.
- Tracing the circular-import avoidance pattern.
<!-- END GENERATED MAP INTENT -->

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
  autoApproveTokenBudget?: number;
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

/**
 * config/index.ts registers this so writeConfigFile() flushes cachedConfig when DB config changes.
 */
registerCacheInvalidator(fn: () => void): void

/**
 * db.ts registers its fire-and-forget persist helper after initStore().
 */
registerConfigPersist(fn: (scope: string, data: unknown) => void): void

/**
 * config/index.ts calls this in writeConfigFile() to push changes to the DB.
 */
persistDbConfig(scope: string, data: unknown): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/types.ts`](../providers/types.md) ×1
- **Imported by:** [`config/index.ts`](../config/index.md) ×9, [`store/db.ts`](db.md) ×6, [`store/db-load.ts`](db-load.md) ×4

## Tests

`tests/store/db-config-cache.test.ts`. 2 other test files reference it.

## Budget

54 / 500 lines (446 to spare).
<!-- END GENERATED MAP FACTS -->

## Lifecycle

- `db.ts` calls `setDbConfigCache()` in `initStore()` after loading the `config` table, and calls `clearDbConfigCache()` in `resetStore()`.
- `db.ts` calls `registerConfigPersist()` in `initStore()` to wire up the async DB write path.
- `config/index.ts` calls `registerCacheInvalidator()` at module load time so cache changes flush `cachedConfig`.
- `config/index.ts` calls `setDbConfigCache()` + `persistDbConfig()` synchronously in `writeConfigFile()` when writing the global config path.

## Key Neighbors

- [providers/db.md](./db.md): owns the libSQL client; writes to the `config` table via `persistDbConfigRowAsync`.
- [config/index.md](../config/index.md): reads from this cache in `loadConfig()`; writes to it in `writeConfigFile()`.

## Update Triggers

Update this page when `SyncableGlobalConfig` fields change, or when the callback pattern is extended.
