# src/providers/model-store.ts - Unified Model Store

**Role:** Public API layer for all per-model data: favorites, native-tools state, per-model settings, eval run records, and observed rate limits. Keyed by `"provider:modelId"`. All public function signatures are synchronous; reads hit the `db.ts` in-memory cache and writes update the cache then fire-and-forget persist to the DB.

The DB migration is complete. `models.json`, `evals/`, and `model-cache.json` are gitignored; the DB (synced via Turso) is the cross-device source of truth. No JSON files are written. All legacy seed functions (`seedFavorites`, `seedNativeTools`, `seedModelSettings`) have been removed — data was migrated once via `store-import.ts` when the DB was introduced.

## Exports

```typescript
getStoreDir(): string                              // .freecode dir; $FREECODE_STORE override, else package root

// Models
getModel(key: string): ModelEntry | undefined      // key = "provider:modelId"
upsertModel(entry: ModelEntry): void               // shallow-merge into the keyed entry

// Favorites
getFavorites(): Set<string>
setFavorite(key: string, isFavorite: boolean): void

// Native-tools detection
setNativeTools(provider: string, modelId: string, value: boolean): void
isNativeToolsDisabled(provider: string, modelId: string): boolean
getNoNativeToolsKeys(): Set<string>                // picker "~tools" badge

// Per-model settings
getModelSettings(key: string): OverridableSettings   // sparse; {} if nothing overridden
setModelSetting(key: string, field: keyof OverridableSettings, value: boolean | undefined): void

// Eval run records (humaneval + custom playground scenarios)
appendEvalRun(key, evalType, summary, doc): void
  // Updates in-memory cache; persists eval_run + eval_transcript rows to DB via saveTranscriptAsync.
getHumanEvalResults(key: string): Record<string, 'pass' | 'fail'>  // latest non-error run per taskId

// Rate limit observation
saveObservedRateLimits(provider, modelId, buckets): void
  // No-op when limit values are unchanged.
```

## Key Neighbors

- [providers/db.md](db.md): owns the libSQL client and in-memory cache; `load()` reads `getCache()`; `save()` calls `setCache()` and `persistModelRowAsync()` per changed key.
- [commands/model.md](../commands/model.md): picker reads `getFavorites`/`getNoNativeToolsKeys` and toggles `setFavorite`.
- [commands/config.md](../commands/config.md): model tab reads `getModelSettings` and writes `setModelSetting`.
- [agent/loop.md](../agent/loop.md): reads `isNativeToolsDisabled` at startup and calls `setNativeTools(.., false)` when a provider rejects native tool calling.

## Update Triggers

Update this page when store functions are added/renamed or the store path changes.
