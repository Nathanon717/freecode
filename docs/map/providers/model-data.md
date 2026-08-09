# src/providers/model-data.ts - Unified Model Store

**Role:** Public API layer for all per-model data: the provider catalog (display name, context window), favorites, native-tools state, per-model settings, eval run records, and observed rate limits. Keyed by `"provider:modelId"`. All public function signatures are synchronous; reads hit the `db.ts` in-memory cache and writes update the cache then fire-and-forget persist to the DB.

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

/**
 * Public API layer for all per-model data. Keyed by `"provider:modelId"`.
 * All public functions are synchronous; persistence is via the `db.ts` in-memory cache.
 */
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
  removed?: boolean;
  settings?: OverridableSettings;
  evals?: { [evalType: string]: EvalRunSummary[] };
  rateLimits?: ObservedRateLimits;
}

getStoreDir(): string

getModel(key: string): ModelEntry | undefined

getFavorites(): Set<string>

setFavorite(key: string, isFavorite: boolean): void

getRemovedKeys(): Set<string>

setRemoved(key: string, removed: boolean): void

setNativeTools(provider: string, modelId: string, value: boolean): void

isNativeToolsDisabled(provider: string, modelId: string): boolean

getNoNativeToolsKeys(): Set<string>

getModelSettings(key: string): OverridableSettings

setModelSetting(key: string, field: keyof OverridableSettings, value: number | boolean | undefined): void

/**
 * Append one eval run to the store. Writes the summary into the in-memory cache and
 * persists the full transcript to `eval_runs`/`eval_transcripts` in the DB via
 * `saveTranscriptAsync` (fire-and-forget, syncs cross-device via Turso).
 */
appendEvalRun(key: string, evalType: string, summary: EvalRunSummary, doc: EvalDoc): void

/**
 * Derive the latest pass/fail per taskId for humaneval runs from the store.
 * Runs where `error !== null` (crashes, python-not-found, etc.) are excluded
 * so a crash does not wipe a prior pass/fail dot.
 */
getHumanEvalResults(key: string): Record<string, "pass" | "fail">

/**
 * The registry's view of one model, as stored in the catalog columns.
 */
interface CatalogModel {
  modelId: string;
  displayName: string;
  contextWindow?: number;
}

/**
 * Write the provider catalog (display name + context window) for one provider into
 * the store. This is the DB's copy of what the provider says exists; user state on
 * the same row is untouched. Rows whose catalog values already match are skipped, so
 * a launch with an unchanged model list writes nothing.
 *
 * Callers pass the provider's *final* model list, so blocklisted models never get a
 * row. Models the provider has stopped offering keep theirs.
 */
saveProviderCatalog(provider: string, models: CatalogModel[]): void

/**
 * The stored catalog for one provider. Feeds the registry's offline path: when a
 * live fetch fails, the model list is rebuilt from here rather than from the
 * on-disk JSON cache, which tracks only ids.
 */
getProviderCatalog(provider: string): CatalogModel[]

/**
 * Persist observed rate limit buckets to the store for the given model.
 * No-op if the limit values are identical to what's already stored.
 */
saveObservedRateLimits(provider: string, modelId: string, buckets: Record<string, ObservedRateLimitBucket>): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`store/db.ts`](../store/db.md) ×7, [`providers/types.ts`](types.md) ×3, [`providers/model-settings-accessor.ts`](model-settings-accessor.md) ×1
- **Imported by:** [`providers/quota/headers.ts`](quota/headers.md) ×7, [`commands/model.ts`](../commands/model.md) ×6, [`cli/eval/humaneval-menu.ts`](../cli/eval/humaneval-menu.md) ×5, [`store/db-load.ts`](../store/db-load.md) ×5, [`commands/config.ts`](../commands/config.md) ×3, [`providers/provider-registry.ts`](provider-registry.md) ×3, [`agent/loop.ts`](../agent/loop.md) ×2, [`store/db.ts`](../store/db.md) ×2, +7 more

## Tests

`tests/providers/model-data.test.ts`. 9 other test files reference it.

## Budget

278 / 500 lines (222 to spare).

## Env

`FREECODE_STORE`
<!-- END GENERATED MAP FACTS -->

## Export notes

- `saveProviderCatalog(provider, models)` / `getProviderCatalog(provider)` — the DB's copy of what a provider says exists. The registry writes it after every successful fetch and reads it back when a fetch fails, so display names and context windows survive offline and sync across machines. Callers pass the provider's **final** model list, so blocklisted models never get a row; models a provider has stopped offering keep theirs. Rows whose catalog values are unchanged are skipped, so a launch with a stable model list writes nothing, and changed rows go out as one batched `persistModelCatalogAsync` rather than a sync per row.
- The catalog columns and user state share a row but never overwrite each other: `saveProviderCatalog` touches only `display_name`/`context_window`, and the user-state writers never touch those two.

## Key Neighbors

- [providers/db.md](../store/db.md): owns the libSQL client and in-memory cache; `load()` reads `getModelData()`; `save()` calls `setModelData()` and `persistModelRowAsync()` per changed key; catalog writes go through `persistModelCatalogAsync` instead.
- [providers/provider-registry.md](provider-registry.md): calls `saveProviderCatalog` after each live init and for static providers, and `getProviderCatalog` on the offline fallback path.
- [providers/model-settings-accessor.md](model-settings-accessor.md): at module load time, `model-data.ts` registers `getModelSettings` into this accessor so `config/index.ts` can call it without a direct import.
- [commands/model.md](../commands/model.md): picker reads `getFavorites`/`getNoNativeToolsKeys` and toggles `setFavorite`.
- [commands/config.md](../commands/config.md): model tab reads `getModelSettings` and writes `setModelSetting`.
- [agent/loop.md](../agent/loop.md): reads `isNativeToolsDisabled` at startup and calls `setNativeTools(.., false)` when a provider rejects native tool calling.

## Update Triggers

Update this page when store functions are added/renamed or the store path changes.
