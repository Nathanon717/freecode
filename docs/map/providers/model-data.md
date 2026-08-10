# src/providers/model-data.ts - Unified Model Store

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Public API layer for all per-model data: the provider catalog (display name, context window), favorites, native-tools state, per-model settings, eval run records, and observed rate limits. Keyed by `"provider:modelId"`. All public function signatures are synchronous; reads hit the `db.ts` in-memory cache and writes update the cache then fire-and-forget persist to the DB.

## Read When

- Changing favorites, removal, or native-tools state per `"provider:modelId"` key.
- Adding persisted per-model settings (temperature, reasoning effort) overrides.
- Debugging eval run recording, humaneval pass/fail derivation, or observed rate limits.
<!-- END GENERATED MAP INTENT -->

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
 * the same row is untouched — this writer touches only `display_name` and
 * `context_window`, and the user-state writers never touch those two. Rows whose
 * catalog values already match are skipped, so a launch with an unchanged model
 * list writes nothing, and the changed rows go out as one batched
 * `persistModelCatalogAsync` rather than a sync per row.
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

281 / 500 lines (219 to spare).

## Env

`FREECODE_STORE`
<!-- END GENERATED MAP FACTS -->

## Notes

The DB is now lazy — `db.ts`'s `ensureStoreReady()` is called at every consumer entry point (agentLoop, getSelectableModels, runConfigCommand, runHumanEvalMenu, runEvalMenu, sendToAgent) before the first store read/mutate. Boot uses `primeConfigCacheFromFile()` (file mirror, no libSQL) to populate the DB config cache without waiting for the real DB.

The DB migration is complete. `models.json`, `evals/`, and `model-cache.json` are gitignored; the DB (synced via Turso) is the cross-device source of truth. No JSON files are written. All legacy seed functions (`seedFavorites`, `seedNativeTools`, `seedModelSettings`) have been removed — data was migrated once via `store-import.ts` when the DB was introduced.

At module load time this file registers `getModelSettings` into
[model-settings-accessor.md](model-settings-accessor.md), so `config/index.ts` can call it
without importing this module — the import graph shows that edge inverted.
