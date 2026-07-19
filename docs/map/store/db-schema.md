# src/store/db-schema.ts - Table & Index DDL

**Role:** All `CREATE TABLE` / `CREATE INDEX` statements for the libSQL store, plus `PRAGMA foreign_keys = ON`. Extracted from `db.ts` so schema changes are a single-file edit and `db.ts` stays under the line limit. Pure DDL — no client lifecycle, no reads, no writes.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
createSchema(c: Client): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Idempotence

`createSchema` runs on every client open, including after a WalConflict replica wipe re-creates the client. Every statement is therefore `IF NOT EXISTS` and must stay safe to re-execute against a populated database. Adding a column to an existing table needs an explicit `ALTER TABLE ... ADD COLUMN`, guarded by a `PRAGMA table_info` check (bare `ADD COLUMN` throws "duplicate column" on re-run) — see the `models.removed` column for the pattern.

Dropping a column is the reverse: remove it from the `CREATE TABLE` and from every read/write in db.ts. Databases created before the drop keep the column as a vestigial nullable that nothing reads, so no migration is needed. `models` carries only state that exists nowhere else — favourite, removed, native-tools override, settings overrides, observed rate limits. Anything the provider registry already knows (display name, context window) belongs there, not here; it was mirrored into `models` once and never written, and both columns were dropped.

## Read When

Adding a table, column, or index. Table-by-table semantics and the read/write architecture live in [db.md](./db.md).

## Key Neighbors

- [db.md](./db.md): sole caller; owns the client, cache, and all persistence functions.
- [call-log.md](./call-log.md): owns the row shape written to `llm_calls`.
