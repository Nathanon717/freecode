# 0005 Turso/libSQL Replaces Git as the Eval/Model Store Sync Layer

**Status:** Accepted
**Date:** 2026-06-19

## Context

Freecode accumulated two git-tracked JSON stores — `model-store.ts` writing to `.freecode/models.json` and `eval-dots.ts` writing to `playground/eval/results/*.json`. Cross-device sync was achieved by committing these files: run on machine A, commit, pull on machine B.

This produced recurring pain: whole-array rewrites on every append (unmergeable history churn), hundreds of timestamped transcript blobs committed in a single push, and merge conflicts whenever two sessions ran in parallel. The underlying requirement was cross-device sync; git was the accidental mechanism for it.

## Decision

Replace both stores with a single `freecode.db` libSQL/Turso embedded replica:

- **Schema:** four tables (`meta`, `models`, `eval_runs`, `eval_transcripts`). `eval_runs` has a UNIQUE constraint on `(model_key, eval_type, task_id, timestamp)` preventing duplicate rows.
- **Sync layer:** Turso cloud. `syncUrl` + `authToken` live in `~/.config/freecode/config.json` under `{ "db": { ... } }` (or env vars `FREECODE_DB_SYNC_URL` / `FREECODE_DB_AUTH_TOKEN`). Absent → pure local file mode, no sync.
- **Architecture:** sync reads from an in-memory cache loaded once at startup; writes update the cache synchronously then persist to libSQL asynchronously (fire-and-forget for the hot path, awaited in tests via `resetStore()`). This preserves all synchronous `model-store.ts` public signatures.
- **Gitignore:** `.freecode/models.json`, `.freecode/evals/`, `.freecode/model-cache.json`, and `freecode.db*` are all gitignored. Local JSON files remain as a write-through durability fallback on the same machine.
- **Legacy data:** one-time importer (`store-import.ts`) runs at first startup, seeding models, eval runs, and transcripts from the legacy JSON files into the DB.

## Consequences

**Easier:**
- No more history churn from data commits; git tracks only code.
- Cross-device sync works without manual `git commit`/`pull` cycles.
- SQL queries become possible over eval history.
- New runs write transcripts to `eval_transcripts` via `saveTranscriptAsync`; they sync automatically.

**Tradeoffs:**
- Requires Turso account and credentials for cross-device sync; without them, data is local-only.
- DB writes are fire-and-forget; a hard crash immediately after a write loses the in-flight data (bounded risk documented in the plan).
- `store-import.ts` must be kept until users have had time to bootstrap their DBs from the legacy JSON files.
- Any future change that reads transcript content must fall back gracefully when `eval_transcripts` is absent for pre-Phase-4 runs that were not imported.
