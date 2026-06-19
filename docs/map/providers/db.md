# src/providers/db.ts - SQLite Store (libSQL/Turso)

**Role:** Owns the libSQL client, schema bootstrap, in-memory model-store cache, startup import trigger, and async transcript persistence. Called once at startup via `initStore()`; all subsequent model-store reads are served from the cache (no per-call file I/O when initialized).

All four phases of the eval/model store migration are complete. See `docs/eval-db-migration-plan.md`.

## Exports

```typescript
initStore(): Promise<void>
  // Creates the libSQL client (local file: or embedded Turso replica if syncUrl+authToken
  // are configured), bootstraps the schema (CREATE TABLE IF NOT EXISTS), runs the one-time
  // legacy data import (store-import.ts — idempotent, no-op after first run or in test envs),
  // syncs from remote if available, then loads all rows into the in-memory cache.
  // Called once at process startup (src/index.ts).

resetStore(): void
  // Closes the client and nulls out the cache. For tests only.

getCache(): Record<string, ModelEntry> | null
  // Returns the in-memory cache, or null if initStore() has not been called.
  // model-store.ts calls this on every load(); null → fallback to models.json.

setCache(store: Record<string, ModelEntry>): void
  // Replaces the in-memory cache synchronously. Does NOT write to the DB.
  // Called by model-store.ts save(); DB persistence is driven by persistModelRowAsync.

persistModelRowAsync(key: string, entry: ModelEntry): void
  // Persists a single model row via one c.execute() INSERT OR REPLACE.
  // Fire-and-forget; tracked in pendingWrites so resetStore() can drain it.
  // Avoids large c.batch() calls that deadlock on synced embedded replicas.
  // Called by model-store.ts save() for each changed key.

saveTranscriptAsync(modelKey, evalType, summary, failReason, transcript, scoringOutcome): void
  // Writes the eval_run row (INSERT OR IGNORE) and the eval_transcripts row for one
  // eval run. Fire-and-forget; tracked in pendingWrites so resetStore() can drain it.
  // Called from model-store.ts appendEvalRun() for every new run.

getDbSyncConfig(): { syncUrl?: string; authToken?: string }
  // Returns the current DB sync configuration (from env vars or config.json).
  // Used by /status to display Turso sync status.
```

## Schema

Four tables are created idempotently at `initStore()`:

- **`meta`** — key/value store for DB metadata; holds `import_done` marker after the one-time legacy import runs.
- **`models`** — one row per `"provider:modelId"` key; structured columns for all `ModelEntry` scalar fields.
- **`eval_runs`** — one row per eval run; UNIQUE on `(model_key, eval_type, task_id, timestamp)` so `INSERT OR IGNORE` / COALESCE upsert is safe. `transcriptRef` is not stored — derived at load time.
- **`eval_transcripts`** — one row per eval run; populated by the Phase 2 legacy importer and by `saveTranscriptAsync` for new runs. Content (full transcript + scoring) syncs cross-device via Turso.

## DB Location & Config

- DB file: `getStoreDir()/freecode.db` (`$FREECODE_STORE` override, else `<packageRoot>/.freecode/`).
- Turso sync: `syncUrl` + `authToken` read from env vars (`FREECODE_DB_SYNC_URL`, `FREECODE_DB_AUTH_TOKEN`) or `~/.config/freecode/config.json` under `{ "db": { "syncUrl": "...", "authToken": "..." } }`. Absent → plain local file: client, no sync.
- `.freecode/freecode.db`, `models.json`, `evals/`, and `model-cache.json` are all gitignored. The DB is the source of truth; local JSON files remain as a write-through fallback on the same machine.

## Read/Write Architecture

- **Reads:** `load()` in model-store returns `getCache()` when initialized, else falls back to `models.json`.
- **Writes:** `save(store, changedKeys?)` in model-store writes to `models.json`, calls `setCache()` to update the in-memory cache synchronously, then calls `persistModelRowAsync(key, entry)` for each changed key — one `c.execute()` per row. `appendEvalRun` additionally calls `saveTranscriptAsync()` to write transcript content; the model row itself is not re-written on eval appends.
- **Durability:** DB writes are fire-and-forget; JSON is the local durable fallback. The DB (synced via Turso) is the cross-device source of truth.

## Read When

- Troubleshooting startup DB errors or the libSQL client configuration.
- Extending the schema (new table or column).
- Understanding why model-store reads hit cache vs. JSON.

## Key Neighbors

- [providers/model-store.md](model-store.md): sole caller of `getCache`/`setCache`.
- [providers/store-import.md](store-import.md): called by `initStore()` for the one-time legacy data import.
- [index.md](../index.md): calls `initStore()` once at startup.
- `docs/eval-db-migration-plan.md`: full migration plan and phase breakdown.

## Update Triggers

Update this page when the schema changes, new exports are added, or the sync config path changes.
