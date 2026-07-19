# src/store/model-list-cache.ts - Model List Cache

**Role:** Tracks the model **ids** each live provider returned on the last successful fetch, in `<packageRoot>/.freecode/model-cache.json` (or `$FREECODE_STORE/model-cache.json`), so the next fetch can be diffed against it: which ids are newly appeared (the "new" badge), which vanished, and which are dead. Clears the new flag when a model is selected.

**Ids only — this is not the catalog.** Display names and context windows live in the `models` table ([db.md](./db.md)), which is the single source for them and syncs across machines. When a live fetch fails, [provider-registry.ts](../providers/provider-registry.md) rebuilds the model list from that table, not from this file; this cache supplies only the new/dead id sets.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface RawCachedModel {
  id: string;
}

getProviderCache(providerId: string): ModelCacheEntry | null

interface CacheUpdateResult {
  newIds: string[];
  removedIds: string[];
}

updateProviderCache(providerId: string, models: RawCachedModel[]): CacheUpdateResult

markModelSelected(providerId: string, modelId: string): void

getDeadIds(providerId: string): string[]

recordDeadModel(providerId: string, modelId: string): void
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

- [provider-registry.md](../providers/provider-registry.md): calls `updateProviderCache` on each successful fetch and `getProviderCache` as fallback.
- [../commands/model.md](../commands/model.md): calls `markModelSelected` on selection; reads `removedIds` to render removed-model rows.
- [model-data.md](../providers/model-data.md): supplies `getStoreDir()` for the cache file path.

## Update Triggers

Update this page if the cache file path, cache entry shape, or exported API changes.
