# src/store/store-paths.ts - Store Location & Sync Credentials

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Resolves where the local store lives on disk and how its libSQL sync credentials are read. Pure path and environment reading — no client, no cache, no I/O beyond one config file read.

## Read When

- Changing where the store directory, DB file, or config mirror lives.
- Changing how sync credentials are discovered or which env vars win.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * `$FREECODE_STORE`, else `<package root>/.freecode`.
 */
getStoreDir(): string

/**
 * The `file:` URL for `freecode.db` inside the store dir.
 */
getDbUrl(): string

/**
 * Path to the config file mirror: `config-cache.json` inside the store dir, which
 * `db.ts` writes so config can be primed at boot without touching libSQL.
 */
getConfigMirrorPath(): string

/**
 * Sync credentials: `FREECODE_DB_SYNC_URL` / `FREECODE_DB_AUTH_TOKEN` take
 * precedence over `db.syncUrl` / `db.authToken` in `~/.config/freecode/config.json`
 * (or `$FREECODE_HOME`). Both halves must be present for syncing to engage; a
 * partial pair reads as local-only. Never throws — a missing or corrupt config
 * file falls back to the env values.
 */
readDbConfig(): { syncUrl?: string | undefined; authToken?: string | undefined; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`store/db.ts`](db.md) ×7

## Tests

`tests/store/store-paths.test.ts`.

## Budget

57 / 500 lines (443 to spare).

## Env

`FREECODE_DB_AUTH_TOKEN`, `FREECODE_DB_SYNC_URL`, `FREECODE_HOME`, `FREECODE_STORE`
<!-- END GENERATED MAP FACTS -->

## Key neighbors

- Extracted from [db.ts](./db.md), its only caller, to keep that file under the 500-line limit. Deliberately dependency-free so importing it can never pull in the libSQL client.
- [model-data.ts](../providers/model-data.md) and [model-list-cache.ts](./model-list-cache.md) carry their own `getStoreDir` for the same directory; they do not import this file.

## Update triggers

- New store path or credential source.
