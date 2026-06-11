# Model Store Redesign — Phased Implementation Plan

Consolidate scattered per-model data into one git-tracked store inside the repo, with eval
transcripts in a parallel directory.

This plan is organized as **self-contained phases**. Each phase moves *one* user-facing
category of model data into the new store, ends with the app fully working and `npm.cmd test`
green, and finishes with a concrete **in-app check** that the user can perform (remind him what it is in your final response per phase). Phases build on
each other (the store module created in Phase 1 is extended by later phases), but no phase
leaves the app in a broken intermediate state — cleanup of a legacy source happens *inside* the
phase that replaces it.

Read the **Shared foundation** below once; every phase relies on it. Data-structure details
live in the **Appendix** at the end and are referenced by the phases that need them.

---

## Shared foundation (applies to every phase)

### Two roots — the load-bearing distinction

There are **two** config roots after this change. Getting this wrong commits API keys.

| Root | Path | Contents | Committed? |
|------|------|----------|------------|
| `getConfigDir()` (unchanged) | `~/.config/freecode` (or `$FREECODE_HOME`) | `config.json` → `providers[].apiKey`, `defaultModel`, global prefs (`toolRationale`, `parallelTools`, …), `providerOverrides` | **No** — holds secrets |
| `getStoreDir()` (new) | `<packageRoot>/.freecode` (or `$FREECODE_STORE`) | `models.json`, `evals/`, `model-cache.json` | **Yes** — git-tracked |

- `config.json` is **never moved**. Across the whole plan it only *loses two fields*
  (`favoriteModels` in Phase 1, `modelOverrides` in Phase 3). `providerOverrides` and all global
  prefs stay.
- `getStoreDir()` anchors to **package root**, not `cwd`, using
  `resolve(fileURLToPath(import.meta.url), '..', ...)` — the same pattern `humaneval.ts` already
  uses. This keeps the store stable regardless of where the CLI is invoked.
- `.gitignore` needs **no change** — `.freecode/` matches no existing ignore pattern, so it is
  tracked as-is.

### freecode never runs git

**All store data is committed to the freecode repo; committing is done manually by the user.**
The store module does file writes only — **no git calls anywhere**, in any phase.

### Test isolation (required in every phase that touches the store)

`$FREECODE_STORE` exists **so tests don't pollute the committed `.freecode/`.** Every
model-store test points it at a `mkdtempSync` temp dir and dynamically imports the module after
setting it — mirroring `tests/providers/model-traits.test.ts` (which does this with
`FREECODE_HOME`). Without this, `npm.cmd test` dirties tracked files.

### Migration = per-category (decided per legacy source)

Migration is **not** a single global switch. Each legacy source is decided on its own merits: carry
over data that is irreplaceable user intent or annoying to recreate; fresh-start data that
auto-regenerates or can't be migrated faithfully.

| Legacy source | Migrate? | Seeded in | Why |
|---------------|----------|-----------|-----|
| `config.favoriteModels` | **Yes** | Phase 1 | Pure user intent; nothing regenerates it. One-line copy. |
| `model-traits.json` (`nativeTools`) | **Yes** | Phase 2 | Cheap copy; saves a first-run redetect blip per affected model. |
| `config.modelOverrides` | **Yes** | Phase 3 | Deliberate per-model settings; already the store `settings` shape. |
| humaneval `.runs/.results/` | **No** | Phase 4 | Legacy is only `{taskId: pass\|fail}` — no transcript/tokens/timestamp to migrate faithfully. Re-runs repopulate dots. |
| `model-cache.json` | **No** | Phase 6 | Volatile live-fetch cache; auto-refetches. |

**How a migration is performed (the three "Yes" rows).** There is **no** standalone
`migrateLegacyData()` entry point. Instead each migrating phase seeds the store *inline* on first
read, then lets the dead legacy source fall away. The pattern is **read-once, idempotent**:

> On the store's first read for that category, if the store data is absent **and** the legacy
> source is present, seed the store from the legacy value. Once the store is populated, subsequent
> reads see it and never consult the legacy source again.

- Removed `config` fields (`favoriteModels` in Phase 1, `modelOverrides` in Phase 3) are dropped
  from the `Config` type, so `writeConfigFile` stops persisting them — but only *after* their value
  has been seeded into the store. Order matters: seed first, then the next config write cleans the
  field out.
- `model-traits.json` is read once to seed `nativeTools`, then left orphaned in `getConfigDir()`;
  it is safe to delete (Phase 7 documents this).

**Fresh-start, as before:** eval history and `model-cache.json` are *not* migrated. Eval dots
repopulate as you run; the cache refetches on next `/model` open.

### Done-when checklist (every phase must satisfy all three)

1. **In-app check** — the phase's named verification passes when you run freecode.
2. **`npm.cmd test` green** — build + docs:generate + scenarios + units.
3. **App still runs end-to-end** — slicing a working app incrementally means each phase must
   leave it functional, even with later phases not yet started.

---

## Phase 1 — Favorites live in the repo store ✅ DONE

**Goal:** Stand up the store module and move *favorites* into `.freecode/models.json`. This phase
carries the store foundation, so it is heavier than the rest — that's expected.

**What you build**

- New module `src/providers/model-store.ts`: sole owner of `getStoreDir()`, `$FREECODE_STORE`
  override, and all reads/writes to `models.json`. Exposes `getModel(key)` / `upsertModel(entry)`
  and, for this phase, `setFavorite(key, bool)` / `getFavorites(): Set<string>`.
- Store key is `"provider:modelId"` (matches the existing model-preference string format).
- Rewire `src/commands/model.ts`: replace `loadFavorites` / `saveFavorites` (from `config`) with
  `getFavorites` / `setFavorite` (from `model-store`). The picker's star toggle and Favorites
  section now read/write the store.
- **Seed favorites from legacy (migration).** On the store's first read of favorites, if
  `models.json` has no favorites recorded yet **and** `config.favoriteModels` is present, seed each
  listed key as `isFavorite: true`. Read-once, idempotent (per foundation). Do this *before*
  removing the field so the value is captured.
- Delete `loadFavorites` / `saveFavorites` from `src/config/index.ts` and remove
  `Config.favoriteModels` from `src/providers/types.ts`. With the field gone from the type,
  `writeConfigFile` drops it on the next config write — after it has already been seeded into the
  store.
- Tests: new `tests/providers/model-store.test.ts` (isolated via `$FREECODE_STORE` + temp dir +
  dynamic import) covering upsert/get + favorites round-trip + **the seed-from-legacy path** (a
  pre-seeded `config.favoriteModels` lands as `isFavorite: true` on first read; an already-populated
  store is left untouched). Update config tests for the removed helpers/field.
- Docs: add `docs/map/providers/model-store.md`; update `docs/map/config/index.md` (removed
  favorites helpers) and `docs/map/providers/types.md` (removed field). Run `docs:generate`.

**In-app check**

1. Launch freecode, open `/model`.
2. Star a model — it appears in the **Favorites** section at the top of the picker.
3. Confirm `<packageRoot>/.freecode/models.json` now exists and the model's entry has
   `"isFavorite": true`.
4. Quit and relaunch — the model is still starred (state came from the store, not config.json).
5. Confirm `config.json` no longer contains `favoriteModels`.
6. **Migration check:** if you had favorites in `config.favoriteModels` before this phase, confirm
   they show up pre-starred in the picker on first launch (seeded, not lost).

---

## Phase 2 — Native-tools detection is store-backed ✅ DONE

**Goal:** Move the `noNativeTools` trait out of `model-traits.json` into the store, and delete the
legacy module.

**What you build**

- Extend `model-store.ts`: `setNativeTools(provider, modelId, value)` (replaces
  `markModelNoNativeTools`), `isNativeToolsDisabled(provider, modelId)` →
  `nativeTools === false` (replaces `isModelNoNativeTools`), `getNoNativeToolsKeys(): Set<string>`
  (replaces `getNoNativeToolsModels` for the picker badge). `nativeTools` defaults `true`, flips
  `false` on detection.
- Rewire `src/agent/loop.ts` (the **write path**): on the `isToolsNotSupportedError` fallback at
  `loop.ts:212-214`, call `setNativeTools(provider, modelId, false)` instead of
  `markModelNoNativeTools`; the startup read at `loop.ts:149` uses `isNativeToolsDisabled`.
- Rewire `src/commands/model.ts` badge (the **read path**): swap `getNoNativeToolsModels` →
  `getNoNativeToolsKeys`.
- **Seed nativeTools from legacy (migration).** On the store's first read of native-tools state, if
  `models.json` has no `nativeTools` recorded for a key **and** the legacy `model-traits.json` lists
  that model as no-native-tools, seed `nativeTools: false` for it. Read-once, idempotent. This must
  happen **before** deleting `model-traits.ts` — extract the legacy file's read into a small
  one-shot seeding helper that runs from `model-store`, then delete the module.
- Delete `src/providers/model-traits.ts` and `tests/providers/model-traits.test.ts`. Delete
  `docs/map/providers/model-traits.md`. Add coverage for the new functions **and the seed-from-
  `model-traits.json` path** to `model-store.test.ts`. Run `docs:generate`.

**In-app check** — two paths, verified separately:

- **Read path (one-click, trivial):** hand-add an entry to `.freecode/models.json` with
  `"nativeTools": false` for a model you have, open `/model`, and confirm the "no native tools"
  badge renders on that row.
- **Write path (multi-step, requires a real rejecting model):** detection only flips during a run
  when a provider *rejects* native tool calling. Select a model known to lack native tool support
  (e.g. a small Groq model such as `groq:llama-3.1-8b-instant`), send a prompt that forces a tool
  call, and watch for the `doesn't support native tool calling — saved` notice. Then reopen
  `/model`: the badge now shows, and `models.json` has `"nativeTools": false` for that key.
  *This path cannot be triggered by a single click — it depends on having a model that actually
  rejects native tools. If you don't have one handy, verify the read path and treat the write
  path as covered by `model-store.test.ts` + the unchanged `loop.ts` fallback logic.*
- **Migration check:** if `model-traits.json` already listed a no-native-tools model before this
  phase, open `/model` on first launch and confirm that model shows the badge without you having to
  re-trigger detection (seeded from the legacy file).

---

## Phase 3 — Per-model settings live in the store ✅ DONE

**Goal:** Move per-model setting overrides out of `config.modelOverrides` into the store, and
rework settings resolution so model-level overrides come from the store while provider/global stay
in config.

**What you build**

- Extend `model-store.ts`: `getModelSettings(key): OverridableSettings` (sparse — only
  explicitly overridden fields present) and `setModelSetting(key, field, value | undefined)`
  (set or clear one field).
- Rework `resolveModelSettings` in `src/config/index.ts`. New precedence:

  ```
  store.settings[field]  >  config.providerOverrides[provider][field]  >  global config[field]
  ```

- Rewire `src/commands/config.ts`: the **model** tab's reads/writes route to
  `getModelSettings` / `setModelSetting`. The **provider** tab and global tabs are unchanged.
- **Seed settings from legacy (migration).** On the store's first read of model settings, if a key
  has no `settings` in `models.json` **and** `config.modelOverrides[key]` is present, seed it into
  the store's sparse `settings`. The legacy `modelOverrides` value is already an `OverridableSettings`
  shape, so this is a direct copy. Read-once, idempotent; do it *before* removing the field.
- Remove `Config.modelOverrides` from `src/providers/types.ts` (keep `providerOverrides` and
  `OverridableSettings`). With the field gone from the type, `writeConfigFile` drops it on the next
  config write — after it has been seeded into the store. `command-dispatcher.ts`'s
  `resolveModelSettings` call is unchanged in signature; only internals move.
- Tests: cover sparse settings get/set **and the seed-from-`config.modelOverrides` path** in
  `model-store.test.ts`; update config tests for the new precedence and removed field. Docs: update
  `docs/map/config/index.md`, `docs/map/commands/config.md`, `docs/map/providers/types.md`. Run
  `docs:generate`.

**In-app check**

1. Open `/config`, go to a model's settings tab, and override a field (e.g. turn `toolRationale`
   off for one model).
2. Confirm `.freecode/models.json` shows that model's `settings` containing **only** the field you
   changed (sparse — not the whole settings object).
3. Run a turn with that model and confirm the override takes effect; switch to a model without the
   override and confirm it falls back to the provider/global default.
4. Confirm `config.json` no longer contains `modelOverrides`; set a *provider*-level override and
   confirm it still works (still lives in config.json).
5. **Migration check:** if you had `config.modelOverrides` entries before this phase, confirm those
   per-model settings carried over into each model's sparse `settings` in `models.json` (seeded, not
   reset to defaults).

---

## Phase 4 — Eval runs (humaneval) recorded in the store ✅ DONE

**Goal:** Record each humaneval run into the store — a summary in `models.json` plus a full
transcript file under `evals/` — and drive the picker's pass/fail dots from the store.

> **User's call — repo growth:** full transcripts per eval run grow the repo over time. Manual
> commit means you control when/whether each run lands, but the size trajectory is upward.

**What you build**

- Extend `model-store.ts`: `appendEvalRun(key, evalType, summary, transcriptDoc)` — appends the
  summary record to `models.json` **and** writes the full
  `evals/{evalType}/{provider}-{modelId}/{timestamp}.json` file in one call. See the **Appendix**
  for the summary and transcript-doc shapes and invariants.
- Rewire `src/commands/humaneval.ts`: replace `loadHumanEvalResults` / `saveHumanEvalResult` with
  the store. After `runOneProblem`, build the summary (`timestamp`, `pass`, `turns`, `tokenUsage`
  from `result.tokens`, `durationMs`, `transcriptRef`, `error`, plus `taskId` so the picker can
  index per problem) and the transcript doc (`failReason` from the failed Python assertions,
  `transcript` = the run's message array, `scoringOutcome` = full pass/fail + stderr tail), then
  call `appendEvalRun(modelKey, 'humaneval', summary, doc)` per problem.
- Picker dots: derive a `taskId → latest pass/fail` view from the store (latest run per `task_id`).
  Remove `playground/humaneval/.runs/.results/` once the store is the source of truth (the
  `.runs/` execution work dir stays).
- Tests: extend `model-store.test.ts` to assert `appendEvalRun` writes **both** the `models.json`
  summary append **and** the transcript file. Add/adjust humaneval coverage for the store write
  path. Docs: update humaneval map page + `model.md` (dots now store-derived). Run `docs:generate`.

**In-app check**

1. Run humaneval against one model on a couple of problems.
2. Confirm `.freecode/evals/humaneval/{provider}-{modelId}/{timestamp}.json` files were written,
   each with `transcript` and `scoringOutcome` populated (and `failReason` only on failed,
   non-crashed runs).
3. Confirm `models.json` for that model has matching `evals.humaneval[]` summary entries whose
   `transcriptRef` points at those files.
4. Open `/model` (or the humaneval picker) and confirm the pass/fail dots reflect the latest run
   per problem — flip a result and re-run to see a dot change.

---

## Phase 5 — Playground `/eval` scenarios recorded as `custom` evals ✅ DONE

**Goal:** Reuse the same store path for playground `/eval` scenarios under `evalType: "custom"`.

**What you build**

- Wire the eval runner's completion path to `appendEvalRun(key, 'custom', summary, doc)`. The
  scenario's `check.ts` post-eval results become `scoringOutcome`; failed assertions become
  `failReason`.
- Tests: scenario/runner coverage for the custom write path. Docs: note `custom` in the
  model-store map page. Run `docs:generate`.

**In-app check**

1. Run a playground `/eval` scenario against a model.
2. Confirm a record lands under `.freecode/evals/custom/{provider}-{modelId}/` and a matching
   `evals.custom[]` summary entry appears in `models.json`.
3. Confirm picker dots / eval views surface the custom result alongside humaneval.

---

## Phase 6 — Final sweep ✅ DONE

**Goal:** Confirm nothing legacy remains and the docs are coherent end-to-end.

**What you build**

- Verify `model-traits.ts`, `loadFavorites`/`saveFavorites`, `Config.modelOverrides`, and
  `Config.favoriteModels` are all gone and have no remaining references. ✅ Confirmed — only
  remnants are the one-shot migration-seed helpers inside `model-store.ts` itself, which is
  correct and intentional.
- Move `model-cache.json` from `getConfigDir()` to `getStoreDir()`. ✅ `model-cache.ts` now
  calls `getStoreDir()` at runtime (not module-load) via `getCachePath()`, so `$FREECODE_STORE`
  overrides work correctly in tests. The cache now lives at `<packageRoot>/.freecode/model-cache.json`.
- `~/.config/freecode/model-traits.json` is never written by freecode after Phase 2. ✅
- Final docs pass + `docs:generate`; full `npm.cmd test` green. ✅

**In-app check** — full smoke test: star a model, set a model-level override, run an eval, reopen
`/model`, and confirm favorites + settings + eval dots all read consistently from
`.freecode/models.json`.

---

## Appendix — Data structures & invariants

### `.freecode/` layout

```
<packageRoot>/.freecode/
  models.json                          ← unified model index (tracked)
  model-cache.json                     ← live-fetch cache, moved here in Phase 6 (tracked)
  evals/
    {evalType}/
      {provider}-{modelId}/
        {timestamp}.json               ← one file per eval run (tracked)
```

### `models.json` (keyed by `"provider:modelId"`)

```jsonc
{
  "groq:llama-3.1-8b-instant": {
    "provider": "groq",
    "modelId": "llama-3.1-8b-instant",
    "displayName": "LLaMA 3.1 8B Instant",
    "nativeTools": true,               // default true, flipped false on detection (Phase 2)
    "contextWindow": 131072,           // null if unknown
    "isFavorite": false,               // Phase 1
    "settings": {                      // Phase 3 — sparse: only overridden fields
      "toolRationale": true,
      "parallelTools": false
    },
    "evals": {                         // Phase 4 / 5
      "humaneval": [
        {
          "timestamp": "2026-06-11T12:00:00.000Z",
          "taskId": "HumanEval/0",
          "pass": false,
          "turns": 4,
          "tokenUsage": { "input": 1200, "output": 430 },
          "durationMs": 5100,
          "transcriptRef": "evals/humaneval/groq-llama-3.1-8b-instant/2026-06-11T120000000Z.json",
          "error": null               // string only on crash, null otherwise
        }
      ],
      "custom": []                     // playground /eval scenarios
    }
  }
}
```

### `evals/{evalType}/{provider}-{modelId}/{timestamp}.json`

```jsonc
{
  "provider": "groq",
  "modelId": "llama-3.1-8b-instant",
  "evalType": "humaneval",
  "timestamp": "2026-06-11T12:00:00.000Z",
  "pass": false,
  "failReason": "assertion 2: expected 'return'; assertion 4: exit code 0 got 1",
  //   ^ present only when pass=false AND error=null; only the FAILED assertions
  "freecodeVersion": null,             // TODO: populate from package.json / git ref
  "transcript": [],                    // full message array
  "scoringOutcome": {}                 // full post-eval results (all assertions)
}
```

### Invariants

- Store key is `"provider:modelId"`.
- `settings` is sparse — only user-overridden fields present; callers fall back to
  provider/global defaults for missing fields (Phase 3 precedence).
- `failReason` absent when `pass=true` or when `error` is set (a crash ≠ a failure).
- `transcriptRef` is a path **relative to `getStoreDir()`**.
- Timestamps in filenames are filesystem-safe (`:` and `.` stripped, e.g.
  `2026-06-11T120000000Z.json`); the ISO timestamp inside the record is canonical.
- All store writes are file writes only — **no git calls anywhere**.

### `model-store.ts` exported surface (built up across phases)

| Function | Phase | Replaces |
|----------|-------|----------|
| `getStoreDir()` | 1 | — (new) |
| `getModel(key)` / `upsertModel(entry)` | 1 | — (new) |
| `setFavorite(key, bool)` / `getFavorites()` | 1 | `saveFavorites` / `loadFavorites` |
| `setNativeTools(provider, modelId, value)` | 2 | `markModelNoNativeTools` |
| `isNativeToolsDisabled(provider, modelId)` | 2 | `isModelNoNativeTools` |
| `getNoNativeToolsKeys()` | 2 | `getNoNativeToolsModels` |
| `getModelSettings(key)` / `setModelSetting(key, field, value)` | 3 | `config.modelOverrides` read/write |
| `appendEvalRun(key, evalType, summary, doc)` | 4 | `saveHumanEvalResult` |
