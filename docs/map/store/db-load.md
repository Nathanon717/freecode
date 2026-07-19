# src/store/db-load.ts - DB Row Hydration

**Role:** Reads the DB into the shapes the app holds in memory — the model-data map and the config blob.

Pure hydration: takes a client, returns plain data, owns no state. Every column decode lives here (null handling, JSON blob parsing, corrupt-row tolerance), so `db.ts` keeps only client lifecycle and writes.

**Read when:** adding a column to `models`/`eval_runs` that must reach `ModelEntry`, or changing how a stored blob is decoded.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
loadFromDb(c: Client): Promise<ModelDataMap>

loadConfigFromDb(c: Client): Promise<DbConfigData>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `loadFromDb` attaches eval runs to their model row and **drops runs whose parent row is absent** (`if (!entry) continue`) — writers must persist the model row alongside the eval, not only the eval.
- Corrupt `settings`/`rate_limits`/`checks` JSON is skipped, never thrown: one bad row must not fail the whole load.

## Key Neighbors

- [store/db.md](db.md): sole caller, from `doInit()`.
- [store/db-types.md](db-types.md): the `ModelDataMap` shape returned.
- [providers/model-data.md](../providers/model-data.md): owns `ModelEntry`/`EvalRunSummary`.

## Update Triggers

Update this page when the columns read, or the decode rules, change.
