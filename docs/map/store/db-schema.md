# src/store/db-schema.ts - Table & Index DDL

<!-- BEGIN GENERATED MAP INTENT -->
## Role

All `CREATE TABLE` / `CREATE INDEX` statements for the libSQL store, plus `PRAGMA foreign_keys = ON` and the guarded `ALTER TABLE` migrations that retrofit columns onto older DBs. Extracted from `db.ts` so schema changes are a single-file edit and `db.ts` stays under the line limit. DDL and schema-shape probes only — no client lifecycle, no row reads or writes.

## Read When

Adding a table, column, or index. Table-by-table semantics and the read/write architecture live in [db.md](./db.md).
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Create every table and index idempotently. Run on each client open (including
 * after a replica wipe), so it must stay safe to re-execute against a live DB.
 * Table-by-table detail lives in docs/map/store/db.md.
 */
createSchema(c: Client): Promise<void>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`store/db.ts`](db.md) ×4

## Tests

`tests/store/db-schema.test.ts`. 1 other test file references it.

## Budget

86 / 500 lines (414 to spare).
<!-- END GENERATED MAP FACTS -->

## Idempotence

`createSchema` runs on every client open, including after a WalConflict replica wipe re-creates the client. Every statement is therefore `IF NOT EXISTS` and must stay safe to re-execute against a populated database. Adding a column to an existing table needs an explicit `ALTER TABLE ... ADD COLUMN`, guarded by a `PRAGMA table_info` check (bare `ADD COLUMN` throws "duplicate column" on re-run) — see the `models.removed` column for the pattern.
