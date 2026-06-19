# src/providers/model-store.ts - Unified Model Store

**Role:** Public API layer for all per-model data: favorites, native-tools state, per-model settings, eval run records, and observed rate limits. Keyed by `"provider:modelId"`. All public function signatures are synchronous; persistence is handled internally via an in-memory cache (backed by `db.ts`) with JSON fallback.

All four phases of the eval/model store DB migration are complete (see `docs/eval-db-migration-plan.md`). Internal `load()`/`save()` use the `db.ts` in-memory cache. `EvalRunSummary` carries `warnings`, `scenarioHash`, `totalTokens`, and `checks`. `playground/eval/results/` JSON is no longer written; dots read from the cache via `eval-dots.ts`. `models.json`, `evals/`, and `model-cache.json` are gitignored — the DB (synced via Turso) is the cross-device source of truth. Local JSON files remain as a write-through fallback.

## Exports

```typescript
// Phase 1 — foundation + favorites
getStoreDir(): string                              // .freecode dir; $FREECODE_STORE override, else package root
getModel(key: string): ModelEntry | undefined      // key = "provider:modelId"
upsertModel(entry: ModelEntry): void               // shallow-merge into the keyed entry
getFavorites(): Set<string>                         // set of favorited "provider:modelId" keys
setFavorite(key: string, isFavorite: boolean): void

// Phase 2 — native-tools detection (replaces the deleted model-traits.ts)
setNativeTools(provider: string, modelId: string, value: boolean): void   // detection write path
isNativeToolsDisabled(provider: string, modelId: string): boolean         // nativeTools === false
getNoNativeToolsKeys(): Set<string>                                       // picker "~tools" badge

// Phase 3 — per-model settings (replaces config.modelOverrides)
getModelSettings(key: string): OverridableSettings   // sparse; {} if nothing overridden
setModelSetting(key: string, field: keyof OverridableSettings, value: boolean | undefined): void

// Phase 4/5 — eval run records (humaneval + custom playground scenarios)
appendEvalRun(key, evalType, summary, doc): void     // writes summary to models.json + transcript to evals/{evalType}/
getHumanEvalResults(key: string): Record<string, 'pass' | 'fail'>  // latest non-error run per taskId

// Rate limit observation
saveObservedRateLimits(provider, modelId, buckets): void
  // Persists limit ceilings from response headers. No-op when limit values are unchanged.
  // buckets: Record<string, ObservedRateLimitBucket>  (see quota/headers.ts)
  // Written to ModelEntry.rateLimits = { buckets, observedAt }
```

## Two Roots

The store (`getStoreDir()`) is **separate** from config (`getConfigDir()`). Config holds secrets and stays untracked; the store is gitignored (data lives in `freecode.db` synced via Turso). `getStoreDir()` anchors to the package root via `import.meta.url`, so it is stable regardless of `cwd`.

## Legacy Seed (favorites)

On the first `getFavorites()`/`setFavorite()` call, if `models.json` does not yet exist **and** `config.favoriteModels` is present, each listed key is seeded as `isFavorite: true`. Gated on store-file absence, so it runs once and never re-seeds (read-once, idempotent). The legacy value is read from the raw config file via `readRawConfig`, since `Config.favoriteModels` is no longer a typed field.

## Legacy Seed (nativeTools)

On the first `isNativeToolsDisabled()`/`getNoNativeToolsKeys()` call, each key listed in the legacy `~/.config/freecode/model-traits.json` (`noNativeTools[]`) is seeded as `nativeTools: false` — **but only if that key has no `nativeTools` value yet**. Gating is per-key (not store-file absence), so it coexists with the favorites seed and never overwrites a value written by runtime detection. `nativeTools` defaults to `true` (absent); detection flips it to `false` via `setNativeTools`. The legacy `model-traits.ts` module is deleted; this is the only remaining reader of that file.

## Legacy Seed (settings)

On the first `getModelSettings()`/`setModelSetting()` call, if `config.modelOverrides` is present in `config.json`, all keys are seeded into `models.json` `settings` in one pass and `modelOverrides` is immediately deleted from `config.json`. Per-key guard prevents overwriting already-seeded entries. After the one-shot seed, the source is gone so re-seeding cannot occur — even after the user clears all overrides (cleared keys keep `settings: {}` as a sentinel rather than reverting to `undefined`).

## Eval Run Records (Phase 4 + 5)

`appendEvalRun` writes three things:
1. A summary record appended to `models.json` (local fallback) under `entry.evals[evalType][]`.
2. A full transcript file at `.freecode/evals/{evalType}/{provider}-{modelId}/{timestampSlug}.json` (local fallback).
3. Both `eval_runs` and `eval_transcripts` rows to the DB via `saveTranscriptAsync` (fire-and-forget; syncs cross-device via Turso).

`transcriptRef` is relative to `getStoreDir()`. `getHumanEvalResults` derives the latest non-error `pass`/`fail` per `taskId` for the picker dots; error runs (crashes, python-not-found) are excluded to preserve prior dots.

Phase 3 collapsed the dual-write: `scenario-menu.ts` calls `appendEvalRun` with `evalType: "custom"`, `taskId = scenario.id`, and the new fields `warnings`, `scenarioHash`, `totalTokens`, `checks`. The legacy `appendEvalHistory` call (which wrote to `playground/eval/results/`) has been removed. Eval-picker dots now source from the in-memory cache via `loadEvalHistory()` in `eval-dots.ts`.

## Read When

- Understanding where favorites, native-tools state, per-model settings, and eval run history are persisted.
- Extending the store with a new per-model category.

## Key Neighbors

- [commands/model.md](../commands/model.md): picker reads `getFavorites`/`getNoNativeToolsKeys` and toggles `setFavorite`.
- [commands/config.md](../commands/config.md): model tab reads `getModelSettings` and writes `setModelSetting`.
- [agent/loop.md](../agent/loop.md): reads `isNativeToolsDisabled` at startup and calls `setNativeTools(.., false)` when a provider rejects native tool calling.
- [providers/db.md](db.md): owns the libSQL client and in-memory cache; `load()` reads `getCache()` from here; `save()` calls `setCache()` to update the cache and `persistModelRowAsync()` for each changed model row.
- [config/index.md](../config/index.md): supplies `getConfigDir`/`getConfigPaths`/`readRawConfig` for the legacy seeds; `resolveModelSettings` calls `getModelSettings` to apply model-level override with highest precedence.

## Update Triggers

Update this page when store functions are added/renamed, the store path changes, or a migration seed is added.
