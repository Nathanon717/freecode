# src/providers/model-store.ts - Unified Model Store

**Role:** Public API layer for all per-model data: favorites, native-tools state, per-model settings, eval run records, and observed rate limits. Keyed by `"provider:modelId"`. All public function signatures are synchronous; reads hit the `db.ts` in-memory cache and writes update the cache then fire-and-forget persist to the DB.

The DB is now lazy — `db.ts`'s `ensureStoreReady()` is called at every consumer entry point (agentLoop, getSelectableModels, runConfigCommand, runHumanEvalMenu, runEvalMenu, sendToAgent) before the first store read/mutate. Boot uses `primeConfigCacheFromFile()` (file mirror, no libSQL) to populate the DB config cache without waiting for the real DB.

The DB migration is complete. `models.json`, `evals/`, and `model-cache.json` are gitignored; the DB (synced via Turso) is the cross-device source of truth. No JSON files are written. All legacy seed functions (`seedFavorites`, `seedNativeTools`, `seedModelSettings`) have been removed — data was migrated once via `store-import.ts` when the DB was introduced.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface EvalRunSummary {
  timestamp: string;
  taskId: string;
  pass: boolean;
  turns: number;
  tokenUsage: { input?: number; output?: number };
  totalTokens?: number;
  durationMs: number;
  error: string | null;
  warnings?: boolean;
  scenarioHash?: string;
  checks?: EvalCheck[];
}

interface ObservedRateLimitBucket {
  limit: number;
  intervalMs: number | null;
}

interface ObservedRateLimits {
  buckets: Record<string, ObservedRateLimitBucket>;
  observedAt: string;
}

interface ModelEntry {
  provider: string;
  modelId: string;
  displayName?: string;
  nativeTools?: boolean;
  contextWindow?: number | null;
  isFavorite?: boolean;
  settings?: OverridableSettings;
  evals?: { [evalType: string]: EvalRunSummary[] };
  rateLimits?: ObservedRateLimits;
}

getStoreDir(): string

getModel(key: string): ModelEntry | undefined

upsertModel(entry: ModelEntry): void

getFavorites(): Set<string>

setFavorite(key: string, isFavorite: boolean): void

setNativeTools(provider: string, modelId: string, value: boolean): void

isNativeToolsDisabled(provider: string, modelId: string): boolean

getNoNativeToolsKeys(): Set<string>

getModelSettings(key: string): OverridableSettings

setModelSetting(key: string, field: keyof OverridableSettings, value: boolean | undefined): void

appendEvalRun(key: string, evalType: string, summary: EvalRunSummary, doc: EvalDoc): void

getHumanEvalResults(key: string): Record<string, "pass" | "fail">

saveObservedRateLimits(provider: string, modelId: string, buckets: Record<string, ObservedRateLimitBucket>): void
```
<!-- END GENERATED EXPORTS -->

## Key Neighbors

- [providers/db.md](db.md): owns the libSQL client and in-memory cache; `load()` reads `getCache()`; `save()` calls `setCache()` and `persistModelRowAsync()` per changed key.
- [providers/model-settings-registry.md](model-settings-registry.md): at module load time, `model-store.ts` registers `getModelSettings` into this registry so `config/index.ts` can call it without a direct import.
- [commands/model.md](../commands/model.md): picker reads `getFavorites`/`getNoNativeToolsKeys` and toggles `setFavorite`.
- [commands/config.md](../commands/config.md): model tab reads `getModelSettings` and writes `setModelSetting`.
- [agent/loop.md](../agent/loop.md): reads `isNativeToolsDisabled` at startup and calls `setNativeTools(.., false)` when a provider rejects native tool calling.

## Update Triggers

Update this page when store functions are added/renamed or the store path changes.
