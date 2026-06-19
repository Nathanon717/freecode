# src/providers/store-import.ts - Legacy Data Importer

**Role:** One-time import of all legacy JSON data (models.json, playground eval results, eval transcripts) into the libSQL database. Called automatically from `initStore()` in `db.ts` on the first startup after the DB is created. Idempotent: sets a `meta('import_done')` marker after success; skips silently on subsequent runs or in test environments where `models.json` is absent.

This is the Phase 2 deliverable of the eval/model store migration. See `docs/eval-db-migration-plan.md`.

## Exports

```typescript
importLegacyData(client: Client): Promise<ImportResult>
  // Imports all legacy data into the libSQL client.
  // Guards:
  //   1. If models.json is absent in FREECODE_STORE → no-op (test safety).
  //   2. If meta('import_done') is set → no-op (already ran).
  // Sources:
  //   - .freecode/models.json          → models + eval_runs tables
  //   - playground/eval/results/*.json → eval_runs (custom scenario history)
  //   - .freecode/evals/**/*.json      → eval_transcripts
  // De-duplication: COALESCE upsert merges complementary fields from the two
  // eval_run sources (playground has scenario_hash/warnings/checks; models.json
  // has turns/duration_ms). UNIQUE constraint: (model_key, eval_type, task_id, timestamp).

interface ImportResult {
  models: number;      // model rows inserted/updated
  evalRuns: number;    // eval_run statements executed (may include dupes merged via upsert)
  transcripts: number; // eval_transcript rows inserted
  skipped: boolean;    // true if import was skipped (guards above)
}
```

## Data Sources → Tables

| Source | Table | eval_type value |
|--------|-------|-----------------|
| `models.json` models fields | `models` | — |
| `models.json` entry.evals.humaneval | `eval_runs` | `'humaneval'` |
| `models.json` entry.evals.custom | `eval_runs` | `'custom'` |
| `playground/eval/results/*.json` | `eval_runs` | `'custom'` (taskId = scenarioId) |
| `.freecode/evals/**/*.json` | `eval_transcripts` | matched via (model_key, eval_type, timestamp) |

## Read When

- Debugging a failed or partial import (check `meta` table for `import_done` marker).
- Extending the import to cover a new legacy data source.
- Understanding how playground eval history and model-store evals are unified.

## Key Neighbors

- [providers/db.md](db.md): calls `importLegacyData` from `initStore()`.
- [providers/model-store.md](model-store.md): source of `ModelEntry` / `EvalRunSummary` types.
- `src/cli/eval-dots.ts`: source of `EvalHistoryEntry` type (playground eval results format).
- `docs/eval-db-migration-plan.md`: full migration plan and phase breakdown.

## Update Triggers

Update this page when new legacy sources are added, the upsert strategy changes, or the idempotency mechanism changes.
