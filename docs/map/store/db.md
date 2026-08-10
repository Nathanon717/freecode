# src/store/db.ts - SQLite Store (libSQL/Turso)

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Owns the libSQL client, schema bootstrap, in-memory model-data cache, startup import trigger, and async transcript persistence. Called once at startup via `initStore()`; all subsequent model-data reads are served from the cache (no per-call file I/O when initialized).

## Read When

- Troubleshooting startup DB errors or the libSQL client configuration.
- Changing when or where schema bootstrap runs; the DDL itself lives in [db-schema.md](./db-schema.md).
- Understanding why model-data reads hit cache vs. JSON.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * One provider-catalog row: the registry's view of a model, no user state.
 */
interface ModelCatalogRow {
  key: string;
  provider: string;
  modelId: string;
  displayName: string;
  contextWindow?: number;
}

/**
 * Synchronously write the DbConfigData to the file mirror.
 * Never throws — missing dir is created; all errors are swallowed.
 */
writeConfigMirror(data: DbConfigData): void

/**
 * Synchronously prime the in-memory DbConfigCache from the file mirror.
 * No libSQL touched. Missing or corrupt file → silent no-op (cache untouched).
 * Call this at boot before the first loadConfig() to populate the cache from the
 * last-written mirror without blocking on libSQL initialisation.
 */
primeConfigCacheFromFile(): void

/**
 * Persist a single model row. Fire-and-forget; serialized through writeChain.
 */
persistModelRowAsync(key: string, entry: ModelEntry): void

/**
 * Upsert the provider catalog (display name + context window) for many models in
 * one batch. `persistModelRowAsync` syncs per row, which would mean hundreds of
 * syncs on startup; this writes every row in a single transaction and syncs once.
 * Only the two catalog columns are touched — user state on an existing row (favorite,
 * removed, settings, rate limits, native tools) is left alone by the conflict clause.
 */
persistModelCatalogAsync(rows: ModelCatalogRow[]): void

/**
 * Delete these model keys and every row that hangs off them. Awaited, not
 * fire-and-forget: the only caller gates it on a user confirmation and must not
 * continue before the rows are gone. Returns `true` when the delete is durable.
 *
 * The children are deleted explicitly, oldest-descendant first, because nothing in
 * the schema cascades: `eval_runs.model_key` and `eval_transcripts.run_id` are plain
 * REFERENCES with no ON DELETE clause, so with `PRAGMA foreign_keys = ON` a parent
 * delete would be rejected outright, and `llm_calls.model_key` is not a foreign key
 * at all, so its rows would simply be orphaned. One batch, so a failure part-way
 * leaves the DB untouched rather than half-deleted.
 *
 * Durability on a synced replica: the delete is written **straight to the primary**
 * via a throwaway remote client, then pulled local — NOT applied to the local replica
 * and pushed on `sync()`. A local-replica delete is an un-pushed WAL frame, and the
 * catalog upserts every launch keep advancing the remote, so that frame perpetually
 * loses the push race and is discarded by the next launch's WalConflict wipe-and-
 * re-pull — the deleted row comes back from the primary, so a model the user removed
 * fully reappears on the next launch, every launch. Writing to the primary sidesteps the
 * race entirely. See db.md.
 */
deleteModelRows(keys: string[]): Promise<boolean>

/**
 * One row per LLM HTTP call. Fire-and-forget; serialized through writeChain.
 */
persistCallLogAsync(row: LlmCallRow): void

saveTranscriptAsync(modelKey: string, evalType: string, summary: EvalRunSummary, failReason: string | undefined, transcript: unknown, scoringOutcome: unknown): void

getDbSyncConfig(): { syncUrl?: string | undefined; authToken?: string | undefined; }

/**
 * Idempotent — multiple callers share a single init promise.
 */
initStore(): Promise<void>

/**
 * Semantic alias for lazy call sites. Memoized — free after first init.
 */
ensureStoreReady(): Promise<void>

/**
 * Drain all pending fire-and-forget writes. Call at graceful shutdown before process exit.
 */
drainPendingWrites(): Promise<void>

/**
 * Reset state — for tests only. Drains in-flight writes before closing.
 */
resetStore(): Promise<void>

getModelData(): ModelDataMap | null

setModelData(store: ModelDataMap): void

/**
 * For testing only: read rows via raw SQL. Separate from executeRawForTesting, whose
 * void return is itself asserted on.
 */
queryRawForTesting(sql: string, args?: InValue[]): Promise<Record<string, unknown>[]>

/**
 * For testing only: execute raw SQL directly against the live client.
 */
executeRawForTesting(sql: string, args: InValue[]): Promise<void>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×13, [`store/store-paths.ts`](store-paths.md) ×7, [`store/db-config-cache.ts`](db-config-cache.md) ×6, [`store/db-replica.ts`](db-replica.md) ×4, [`store/db-schema.ts`](db-schema.md) ×4, [`store/db-types.ts`](db-types.md) ×3, [`providers/model-data.ts`](../providers/model-data.md) ×2, [`store/db-load.ts`](db-load.md) ×2, [`store/call-log.ts`](call-log.md) ×1
- **Imported by:** [`providers/model-data.ts`](../providers/model-data.md) ×7, [`commands/model.ts`](../commands/model.md) ×3, [`agent/loop.ts`](../agent/loop.md) ×1, [`cli/command-dispatcher.ts`](../cli/command-dispatcher.md) ×1, [`cli/eval/eval-menu.ts`](../cli/eval/eval-menu.md) ×1, [`commands/config.ts`](../commands/config.md) ×1, [`commands/status.ts`](../commands/status.md) ×1, [`config/index.ts`](../config/index.md) ×1, +2 more

## Tests

`tests/store/db.test.ts`. 6 other test files reference it.

## Budget

476 / 500 lines (24 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

The eval/model store migration is complete — expect no half-migrated state.

## Schema

Six tables are created idempotently at `initStore()`. The DDL itself lives in [db-schema.md](./db-schema.md); the semantics are:

- **`meta`** — key/value store for DB metadata (legacy; holds `import_done` marker from the one-time migration that has already run).
- **`models`** — one row per `"provider:modelId"` key; structured columns for all `ModelEntry` scalar fields, including `removed` (soft-hide from the model picker; see [commands/model.md](../commands/model.md)).
- **`eval_runs`** — one row per eval run; UNIQUE on `(model_key, eval_type, task_id, timestamp)` so `INSERT OR IGNORE` / COALESCE upsert is safe. `transcriptRef` is not stored — derived at load time.
- **`eval_transcripts`** — one row per eval run; populated by the legacy transcript importer and by `saveTranscriptAsync` for new runs. Content (full transcript + scoring) syncs cross-device via Turso.
- **`llm_calls`** — one row per LLM HTTP call, written by `persistCallLogAsync` from the adapter fetch wrappers. Deliberately has **no FK** to `models`: a call must be loggable for a model that was never persisted, and the log must never fail on a missing parent. Indexed on `(model_key, timestamp)` for the rate-limit inference queries. Row shape and the no-estimation rule live in [call-log.md](./call-log.md).
- **`config`** — one row per scope (`'global'`, `'providerOverrides'`); `data` column holds a JSON blob. Stores syncable global settings and provider overrides. Written on every `writeConfigFile()` call for the global config path; loaded at startup into `db-config-cache.ts`.

## DB Location & Config

- DB file: `getStoreDir()/freecode.db` (`$FREECODE_STORE` override, else `<packageRoot>/.freecode/`).
- Turso sync: `syncUrl` + `authToken` read from env vars (`FREECODE_DB_SYNC_URL`, `FREECODE_DB_AUTH_TOKEN`) or `~/.config/freecode/config.json` under `{ "db": { "syncUrl": "...", "authToken": "..." } }`. Absent → plain local file: client, no sync.
- `.freecode/freecode.db`, `models.json`, `evals/`, and `model-cache.json` are all gitignored. The DB (synced via Turso) is the cross-device source of truth; no JSON files are written by the running app.

## Init Resilience (`doInit`)

`initStore()` memoizes `doInit()`, so a thrown init would poison the shared promise and re-throw on every later `ensureStoreReady()` — crashing every interactive menu (`runMenuShell` awaits it). `doInit` therefore **never throws**: any failure is caught, the bad client is closed, and the store degrades to an empty in-memory cache (reads empty, writes no-op). The config cache primed from `config-cache.json` at boot is left intact.

WalConflict recovery: a libSQL embedded replica can diverge from the remote (`sync()` can't push the conflicting frames and the next write — the schema `CREATE TABLE` — throws `WalConflict`). `isReplicaConflict()` detects this; recovery closes the client, `wipeLocalDb()` deletes the db + sidecars, and the client is reopened and re-pulled once. The wipe must include the **`-info`** sidecar (replica sync metadata) — `DB_FILE_SUFFIXES` covers `'', -shm, -wal, -info, -meta`. The wipe is **gated on the conflict**: transient network/auth sync errors keep the local replica and run offline, never wiped (a wipe discards un-pushed local writes — models re-fetch, config is mirrored, eval history is the only real loss). `isReplicaConflict()` matches only `WalConflict` — it deliberately does **not** match `local state is incorrect…` (that error is never thrown and self-heals; see below).

Tokenless-replica decline (`isSyncReplica`): sync tokens reach `readDbConfig` only when they're in the environment (e.g. Doppler-injected at startup). A run without them (direct `node`, pty tests) would open the *same* `.freecode/freecode.db` as a **plain** client, whose write dirties the WAL and invalidates the replica's `-info` sync metadata — so the next tokened run sees `local state is incorrect, db file exists but metadata file does not`, discards the replica, and re-pulls the whole DB (slow, and logged). To prevent that corruption, the **no-tokens branch of `openAndPrepareClient` declines to open** when an `-info` sidecar is present: `client` stays null, `doInit` degrades to an empty cache (no persistence that session), and the replica is preserved intact for the next sync. A genuinely tokenless user (no `-info`) still opens a plain local file. This decline is a **calm, expected** path — `doInit` guards for the null client explicitly so it does **not** hit the "Store init failed" error branch.

## Read/Write Architecture

- **Reads:** `load()` in model-data returns `getModelData()` when initialized, else returns `{}`.
- **Writes:** `save(store, changedKeys?)` in model-data calls `setModelData()` to update the in-memory cache synchronously, then calls `persistModelRowAsync(key, entry)` for each changed key — one `c.execute()` per row. `appendEvalRun` additionally calls `saveTranscriptAsync()` to persist transcript content to `eval_runs`/`eval_transcripts`, and persists the model row (via `save(store, [key])`) so the FK parent exists; `saveTranscriptAsync` also self-insures the parent row (INSERT OR IGNORE on `models`) to stay order-independent of the model-row write.
- **Durability:** DB writes are fire-and-forget. The DB (synced via Turso) is the cross-device source of truth.
- **Deletes:** `deleteModelRows(keys)` is the one **awaited** write — its caller gates it on a user confirmation and must know it landed; it returns `true` when the delete is durable. It deletes children explicitly, deepest first (`eval_transcripts` → `eval_runs` → `llm_calls` → `models`), because nothing in the schema cascades: the `REFERENCES` clauses carry no `ON DELETE`, so with `PRAGMA foreign_keys = ON` a bare parent delete is rejected, and `llm_calls` has no FK at all so its rows would just be orphaned. One batch, so a mid-way failure leaves the DB untouched. Adding `ON DELETE CASCADE` is not an option — SQLite cannot ALTER a constraint in, and it still would not reach `llm_calls`. On a **synced** store the batch runs **directly against the primary** (a throwaway remote client from `readDbConfig`'s `syncUrl`/`authToken`), then `client.sync()` pulls it local — NOT a local-replica delete pushed on `sync()`. A local delete is an un-pushed WAL frame, and the per-launch catalog upserts keep advancing the remote, so that frame loses the push race and is discarded by the next launch's WalConflict wipe-and-re-pull — the row comes back forever, so a model the user removed fully reappears on every launch. Writing to the primary sidesteps the race; `false` (returned when the primary write fails, e.g. offline) means the caller should tell the user it will retry next launch. See `docs/bug log/24-07-2026.md`.
