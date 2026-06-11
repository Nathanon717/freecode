# src/providers/model-store.ts - Unified Model Store

**Role:** Sole owner of the git-tracked store under `<packageRoot>/.freecode/` (or `$FREECODE_STORE`). Reads/writes `models.json`, keyed by `"provider:modelId"`. All writes are plain file writes — **no git calls anywhere** (the user commits manually).

This is the foundation module of the model-store redesign (`docs/model-store-plan.md`). All phases (1–6) are complete. Phase 4 added eval-run recording for `/humaneval`; Phase 5 wired playground `/eval` scenarios as `evalType: "custom"` runs; Phase 6 moved `model-cache.json` here and confirmed all legacy modules are gone.

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

The store (`getStoreDir()`) is **separate** from config (`getConfigDir()`). Config holds secrets and stays untracked; the store is git-tracked. `getStoreDir()` anchors to the package root via `import.meta.url`, so it is stable regardless of `cwd`.

## Legacy Seed (favorites)

On the first `getFavorites()`/`setFavorite()` call, if `models.json` does not yet exist **and** `config.favoriteModels` is present, each listed key is seeded as `isFavorite: true`. Gated on store-file absence, so it runs once and never re-seeds (read-once, idempotent). The legacy value is read from the raw config file via `readRawConfig`, since `Config.favoriteModels` is no longer a typed field.

## Legacy Seed (nativeTools)

On the first `isNativeToolsDisabled()`/`getNoNativeToolsKeys()` call, each key listed in the legacy `~/.config/freecode/model-traits.json` (`noNativeTools[]`) is seeded as `nativeTools: false` — **but only if that key has no `nativeTools` value yet**. Gating is per-key (not store-file absence), so it coexists with the favorites seed and never overwrites a value written by runtime detection. `nativeTools` defaults to `true` (absent); detection flips it to `false` via `setNativeTools`. The legacy `model-traits.ts` module is deleted; this is the only remaining reader of that file.

## Legacy Seed (settings)

On the first `getModelSettings()`/`setModelSetting()` call, if `config.modelOverrides` is present in `config.json`, all keys are seeded into `models.json` `settings` in one pass and `modelOverrides` is immediately deleted from `config.json`. Per-key guard prevents overwriting already-seeded entries. After the one-shot seed, the source is gone so re-seeding cannot occur — even after the user clears all overrides (cleared keys keep `settings: {}` as a sentinel rather than reverting to `undefined`).

## Eval Run Records (Phase 4 + 5)

`appendEvalRun` writes two things atomically:
1. A summary record appended to `models.json` under `entry.evals[evalType][]`, including `taskId`, `pass`, `turns`, `tokenUsage`, `durationMs`, `error`, and `transcriptRef`.
2. A full transcript file at `evals/{evalType}/{provider}-{modelId}/{timestampSlug}.json` containing `transcript` (a single-turn object with `systemPrompt`, `userMessage`, `tokenUsage`, `toolCalls`), `scoringOutcome`, and `failReason` (present only when `pass=false` and `error=null`).

`transcriptRef` is relative to `getStoreDir()`. `getHumanEvalResults` derives the latest non-error `pass`/`fail` per `taskId` for the picker dots; error runs (crashes, python-not-found) are excluded to preserve prior dots.

Phase 5 wired playground `/eval` scenario completions (`src/cli/scenario-menu.ts`) to call `appendEvalRun` with `evalType: "custom"` and `taskId = scenario.id`. The existing `appendEvalHistory` call (which drives eval-picker dots via the `playground/eval/results/` flat files) is kept alongside; the store record is additive.

## Read When

- Understanding where favorites, native-tools state, per-model settings, and eval run history are persisted.
- Extending the store with a new per-model category.

## Key Neighbors

- [commands/model.md](../commands/model.md): picker reads `getFavorites`/`getNoNativeToolsKeys` and toggles `setFavorite`.
- [commands/config.md](../commands/config.md): model tab reads `getModelSettings` and writes `setModelSetting`.
- [agent/loop.md](../agent/loop.md): reads `isNativeToolsDisabled` at startup and calls `setNativeTools(.., false)` when a provider rejects native tool calling.
- [config/index.md](../config/index.md): supplies `getConfigDir`/`getConfigPaths`/`readRawConfig` for the legacy seeds; `resolveModelSettings` calls `getModelSettings` to apply model-level override with highest precedence.

## Update Triggers

Update this page when store functions are added/renamed, the store path changes, or a migration seed is added.
