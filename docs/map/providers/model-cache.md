# src/providers/model-cache.ts - Model Cache

**Role:** Persists the most recent successful model-list fetch for each live provider to `<packageRoot>/.freecode/model-cache.json` (or `$FREECODE_STORE/model-cache.json`). Provides fallback data when a live fetch fails, tracks which model IDs are newly appeared (for "new" badge display), and clears that flag when a model is selected.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface RawCachedModel {
  id: string;
  displayName: string;
  contextWindow?: number;
}

getProviderCache(providerId: string): ModelCacheEntry | null

interface CacheUpdateResult {
  newIds: string[];
  removedIds: string[];
}

updateProviderCache(providerId: string, models: RawCachedModel[]): CacheUpdateResult

markModelSelected(providerId: string, modelId: string): void

getDeadIds(providerId: string): string[]

markModelDead(providerId: string, modelId: string): void
```
<!-- END GENERATED EXPORTS -->

## Cache File Shape

```json
{
  "groq": {
    "fetchedAt": "2026-05-20T...",
    "models": [{ "id": "...", "displayName": "...", "contextWindow": 128000 }],
    "newIds": ["recently-appeared-id"],
    "removedIds": ["recently-removed-id"],
    "deadIds": ["model-that-returned-404"]
  }
}
```

## Read When

- Debugging why a live provider shows stale or empty models.
- Adding new logic that needs to know whether a model is new or was recently removed.

## Key Neighbors

- [registry.md](registry.md): calls `updateProviderCache` on each successful fetch and `getProviderCache` as fallback.
- [../commands/model.md](../../map/commands/model.md): calls `markModelSelected` on selection; reads `removedIds` to render removed-model rows.
- [model-store.md](model-store.md): supplies `getStoreDir()` for the cache file path.

## Update Triggers

Update this page if the cache file path, cache entry shape, or exported API changes.
