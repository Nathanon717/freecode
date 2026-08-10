# src/store/db-load.ts - DB Row Hydration

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Reads the DB into the shapes the app holds in memory — the model-data map and the config blob.

## Read When

adding a column to `models`/`eval_runs` that must reach `ModelEntry`, or changing how a stored blob is decoded.
<!-- END GENERATED MAP INTENT -->

Pure hydration: takes a client, returns plain data, owns no state. Every column decode lives here (null handling, JSON blob parsing, corrupt-row tolerance), so `db.ts` keeps only client lifecycle and writes.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Reads the DB into the shapes the rest of the app holds in memory: the model-data
 * map and the config blob. Pure hydration — takes a client, returns plain data, owns
 * no state. Every column decode (null handling, JSON blobs, corrupt-row tolerance)
 * lives here so `db.ts` keeps only client lifecycle and writes.
 *
 * Eval runs attach to their model row, and a run whose parent row is absent is
 * **dropped** — writers must persist the model row alongside the eval, not only
 * the eval. Corrupt `settings` / `rate_limits` / `checks` JSON is skipped rather
 * than thrown: one bad row must not fail the whole load.
 */
loadFromDb(c: Client): Promise<ModelDataMap>

loadConfigFromDb(c: Client): Promise<DbConfigData>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/model-data.ts`](../providers/model-data.md) ×5, [`store/db-config-cache.ts`](db-config-cache.md) ×4, [`store/db-types.ts`](db-types.md) ×2
- **Imported by:** [`store/db.ts`](db.md) ×2

## Tests

`tests/store/db-load.test.ts`.

## Budget

92 / 500 lines (408 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [store/db.md](db.md): sole caller, from `doInit()`.
- [store/db-types.md](db-types.md): the `ModelDataMap` shape returned.
- [providers/model-data.md](../providers/model-data.md): owns `ModelEntry`/`EvalRunSummary`.

## Update Triggers

Update this page when the columns read, or the decode rules, change.
