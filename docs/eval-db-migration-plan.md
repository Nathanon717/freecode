# Eval/Model Store → SQLite (Turso) Migration Plan

Replace the **git-as-database** storage (whole-file JSON rewrites committed to the repo) with a
real, queryable, **cross-device-synced** SQLite database via Turso/libSQL embedded replicas.

## Why

Git was acting as the sync layer (commit on one machine, pull on another) — which is *why*
everything was committed. That produces the pain the user is done with: whole-array rewrites on
every append, unmergeable churn, history bloat (e.g. the `zen-big-pickle` commit dumping hundreds
of timestamped transcript JSONs), and merge conflicts. **Cross-device sync is the hard
requirement**, so a plain local-only SQLite file is insufficient — it wouldn't sync.

## Decisions (locked)

- **Engine:** Turso / libSQL embedded replica. Real SQL DB, but reads hit a *local* replica
  (`.freecode/freecode.db`) so it stays fast + offline-capable; background `.sync()` propagates
  across devices. Package: `@libsql/client`.
- **Hosting:** Managed Turso cloud. Remote `syncUrl` + `authToken` live in `~/.config/freecode`
  (alongside provider API keys) — **never** in git.
- **Existing data:** Import everything (292 `playground/eval/results/*.json` + `.freecode/evals/`
  transcripts + `models.json` favorites/settings/traits/rateLimits) via a one-time importer.
- **`.freecode/freecode.db` is gitignored.** Git stops being the data layer entirely.
- **`model-cache.json`** stays a local, volatile file — not synced (auto-refetches).

## Core architecture: sync reads, async writes

The data is tiny (~55KB `models.json`, ~2.8MB total incl. transcripts), so:

- **Reads stay synchronous**, served from an **in-memory cache** loaded once during the
  already-async startup path (after an initial `await client.sync()` + full table load). This keeps
  every current `model-store.ts` signature intact — `getFavorites(): Set`,
  `getHumanEvalResults(): Record`, `getNoNativeToolsKeys(): Set`, etc. — so the Ink render paths in
  `model.ts` and the scenario menu need **no async refactor**.
- **Writes update the in-memory cache synchronously** (preserving read-your-writes), then persist
  to libSQL asynchronously and trigger a background `.sync()`.
- **Durability wrinkle:** fire-and-forget writes can be lost if the CLI exits immediately after.
  → `await` persistence in non-hot paths (favorites toggle, settings, `appendEvalRun`) which are
  already async contexts; leave the per-response-turn hot path (`saveObservedRateLimits`)
  best-effort. Bounded, documented, not blocking.

Only `load()`/`save()` internals of `model-store.ts` change; the public API surface is preserved.

## Schema (lightly normalized — data is small)

```sql
CREATE TABLE models (
  key           TEXT PRIMARY KEY,      -- "provider:modelId"
  provider      TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  display_name  TEXT,
  native_tools  INTEGER,              -- nullable boolean
  context_window INTEGER,
  is_favorite   INTEGER DEFAULT 0,
  settings      TEXT,                 -- JSON (sparse OverridableSettings)
  rate_limits   TEXT                  -- JSON (ObservedRateLimits)
);

CREATE TABLE eval_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  model_key     TEXT NOT NULL REFERENCES models(key),
  eval_type     TEXT NOT NULL,        -- 'humaneval' | 'custom' | playground scenario id
  task_id       TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  pass          INTEGER NOT NULL,
  warnings      INTEGER,
  turns         INTEGER,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  total_tokens  INTEGER,
  duration_ms   INTEGER,
  scenario_hash TEXT,
  error         TEXT,
  checks        TEXT                  -- JSON (EvalCheckResult[])
);

CREATE TABLE eval_transcripts (
  run_id        INTEGER PRIMARY KEY REFERENCES eval_runs(id),
  fail_reason   TEXT,
  transcript    TEXT,                 -- JSON blob (the big payload)
  scoring       TEXT                  -- JSON blob
);

CREATE INDEX idx_eval_runs_lookup ON eval_runs(model_key, eval_type, task_id, timestamp);
```

This unifies BOTH legacy stores (`eval-dots.ts`/`playground/eval/results` and
`model-store.ts`/`.freecode/evals`) onto one `eval_runs` table, collapsing the dual-write.

## Phases

Each phase ends with `npm.cmd test` green and the app working end-to-end. Nothing legacy is
deleted or un-committed until the DB path is proven.
note - after completing a phase, mark it as finished and if needed edit it to reflect anything that changed or extra info.
note - if u get the 500 max line count thing, ignore it untill ur ready to delete the code thats being replaced

### Phase 1 — DB foundation behind the existing API (non-destructive) ✅ COMPLETE
- Add `@libsql/client` dependency.
- New `src/providers/db.ts`: owns the libSQL client (`createClient`), schema bootstrap (idempotent
  `CREATE TABLE IF NOT EXISTS`), `syncUrl`/`authToken` read from config (absent → pure local
  `file:` mode, no sync), an `initStore()` called in startup that `await`s initial sync + load, and
  the in-memory cache.
- Rewrite `model-store.ts` `load()`/`save()` internals to read/write the cache backed by `db.ts`.
  **All exported signatures unchanged.** Legacy JSON seed helpers stay (still read config for
  first-run favorites/traits/settings seeding).
- `.gitignore`: add `.freecode/freecode.db*`.
- Tests: `model-store.test.ts` and new `db.test.ts` both call `initStore()` against temp `file:`
  DBs. `resetStore()` drains in-flight writes before close; temp dir cleanup is best-effort (Windows
  WAL file handles linger briefly — `rmSync` is wrapped try-catch, OS cleans up). 488 tests pass.
- **Notes:** `resetStore()` is async (exported for test teardown). `persistAsync` tracks in-flight
  writes via a `Set<Promise<void>>` so `resetStore()` can drain them. JSON still written in `save()`
  — source of truth through Phase 2. Schema: `models` + `eval_runs` + `eval_transcripts` tables
  created; `eval_transcripts` not yet populated (Phase 4).
- **Verified:** `npm.cmd test` green (488/488). App builds clean.

### Phase 2 — One-time importer ✅ COMPLETE
- `src/providers/store-import.ts`: reads `models.json`, `.freecode/evals/**`, and
  `playground/eval/results/*.json`, writes them into the DB. Auto-triggered from `initStore()`
  in `db.ts`; idempotent via a `meta('import_done')` marker (also skips when models.json is
  absent — keeps tests clean).
- De-dupe: both eval stores share `(model_key, eval_type, task_id, timestamp)`. A COALESCE
  upsert merges complementary fields: playground rows supply `scenario_hash/warnings/checks`,
  models.json rows supply `turns/duration_ms`. UNIQUE constraint prevents duplicate rows.
- `meta` table added to schema in `db.ts` (holds `import_done` key).
- **Verified:** 63 models, 574 eval_runs, 121 eval_transcripts on first startup. Favorites
  round-trip correctly. Scenario_hash present on playground runs. 495 tests pass.
- **Notes:** `result.models` includes stub rows created for playground-only models not in
  models.json. The import runs on first startup after Phase 2 regardless of whether Phase 1
  had already populated the DB — the meta marker is what gates it, not model count.

### Phase 3 — Collapse the dual-write & retire eval-dots JSON ✅ COMPLETE
- `scenario-menu.ts`: dropped the `appendEvalHistory` call; all scenario-eval writes now go through
  `appendEvalRun` (DB path). `appendEvalHistory` fully removed from `eval-runner.ts`.
- `eval-dots.ts` `loadEvalHistory()` now reads from the in-memory DB cache (via `getCache()` from
  `db.ts`) when available; falls back to `playground/eval/results/*.json` when cache is null
  (e.g. early in process startup or in tests that don't call `initStore()`).
- `EvalRunSummary` extended with `warnings`, `scenarioHash`, `totalTokens`, `checks`. `db.ts`
  `loadFromDb` SELECT and `persistAsync` INSERT both extended to handle these fields.
- `.gitignore` updated; tracked artifact files untracked with `git rm --cached -r` (note: also
  untracked `.run/` and `work/` subdirs beyond the spec, since they were churning in git status).
- Local `EvalCheck` interface added to `model-store.ts` (structurally identical to `EvalCheckResult`)
  to avoid a circular import between `model-store.ts` and `eval-dots.ts`.
- `loadEvalHistory()` normalizes `model: modelKey || 'default'` to match the `getEvalStatus`
  `model || 'default'` normalization (avoids grey dots on no-model runs).
- **Verified:** 495/495 tests green, build clean, docs:generate clean.
- **Notes:** `persistAsync` uses `INSERT OR IGNORE` so imported rows (Phase 2) are not overwritten;
  new runs add full-field rows including `warnings/scenario_hash/checks`. `loadEvalHistory` snapshot
  is captured once at `runEvalMenu` entry; within a session the dots update on menu-reopen.

### Phase 4 — Turso sync wiring + cleanup ✅ COMPLETE
- `/db` slash command: shows Turso sync status and setup instructions (`src/commands/db.ts`). Credentials set via `~/.config/freecode/config.json` `{ "db": { "syncUrl": "...", "authToken": "..." } }` or env vars `FREECODE_DB_SYNC_URL` / `FREECODE_DB_AUTH_TOKEN`.
- Background `.sync()` on startup + after eval-run appends (already wired in `initStore` + `persistAsync`).
- `saveTranscriptAsync` added to `db.ts`: new runs write `eval_runs` + `eval_transcripts` to the DB so transcript content syncs cross-device.
- Gitignored + `git rm --cached`: `.freecode/models.json`, `.freecode/evals/`, `.freecode/model-cache.json`. Local JSON files remain as write-through fallback.
- Docs: `db.md` and `model-store.md` updated; ADR `docs/architecture/adr/0005-libsql-turso-sync.md` written; map page `docs/map/commands/db.md` added; `docs:generate` clean.
- **Verify (cross-device):** configure Turso credentials on both machines, run an eval on machine A, confirm machine B sees the run on next startup via Turso sync.
- **Verified:** 496/496 tests green, build clean, docs:generate clean.

## Migration safety

Do **not** stop committing or delete the `.freecode/` JSON or `playground/eval/results/` until the
DB path + importer are verified and a round-trip is proven. JSON remains source of truth through
Phases 1–2; cutover happens in Phases 3–4.
