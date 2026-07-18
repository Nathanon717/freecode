# src/providers/db.ts - SQLite Store (libSQL/Turso)

**Role:** Owns the libSQL client, schema bootstrap, in-memory model-data cache, startup import trigger, and async transcript persistence. Called once at startup via `initStore()`; all subsequent model-data reads are served from the cache (no per-call file I/O when initialized).

All four phases of the eval/model store migration are complete. See `docs/plans/eval-db-migration-plan.md`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
wipeLocalDb(url: string): void

isReplicaConflict(err: unknown): boolean

writeConfigMirror(data: DbConfigData): void

primeConfigCacheFromFile(): void

persistModelRowAsync(key: string, entry: ModelEntry): void

persistCallLogAsync(row: LlmCallRow): void

saveTranscriptAsync(modelKey: string, evalType: string, summary: EvalRunSummary, failReason: string | undefined, transcript: unknown, scoringOutcome: unknown): void

getDbSyncConfig(): { syncUrl?: string | undefined; authToken?: string | undefined; }

initStore(): Promise<void>

ensureStoreReady(): Promise<void>

drainPendingWrites(): Promise<void>

resetStore(): Promise<void>

getModelData(): ModelDataMap | null

setModelData(store: ModelDataMap): void

executeRawForTesting(sql: string, args: InValue[]): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Schema

Six tables are created idempotently at `initStore()`. The DDL itself lives in [db-schema.md](db-schema.md); the semantics are:

- **`meta`** — key/value store for DB metadata (legacy; holds `import_done` marker from the one-time migration that has already run).
- **`models`** — one row per `"provider:modelId"` key; structured columns for all `ModelEntry` scalar fields.
- **`eval_runs`** — one row per eval run; UNIQUE on `(model_key, eval_type, task_id, timestamp)` so `INSERT OR IGNORE` / COALESCE upsert is safe. `transcriptRef` is not stored — derived at load time.
- **`eval_transcripts`** — one row per eval run; populated by the Phase 2 legacy importer and by `saveTranscriptAsync` for new runs. Content (full transcript + scoring) syncs cross-device via Turso.
- **`llm_calls`** — one row per LLM HTTP call, written by `persistCallLogAsync` from the adapter fetch wrappers. Deliberately has **no FK** to `models`: a call must be loggable for a model that was never persisted, and the log must never fail on a missing parent. Indexed on `(model_key, timestamp)` for the rate-limit inference queries. Row shape and the no-estimation rule live in [call-log.md](call-log.md).
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

## Read When

- Troubleshooting startup DB errors or the libSQL client configuration.
- Extending the schema (new table or column).
- Understanding why model-data reads hit cache vs. JSON.

## Key Neighbors

- [providers/model-data.md](model-data.md): sole caller of `getModelData`/`setModelData`.
- [index.md](../index.md): calls `initStore()` once at startup.
- `docs/plans/eval-db-migration-plan.md`: full migration plan and phase breakdown.

## Update Triggers

Update this page when the schema changes, new exports are added, or the sync config path changes.
