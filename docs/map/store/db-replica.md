# src/store/db-replica.ts - Replica Detection & Recovery

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Pure helpers for recognizing and recovering a libSQL embedded replica on disk: which sidecar files a replica owns, whether a given db file is one, whether an error is the diverged-replica WalConflict that justifies a destructive wipe, and the wipe itself. Stateless — it never touches the open client, which is [db.md](./db.md)'s job.

## Read When

- Changing which sidecar files a replica wipe removes, or debugging a WalConflict that survives the re-pull.
- Changing how a sync replica is told apart from a plain local db file.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Remove the local db file and all its libSQL sidecars. Never throws.
 */
wipeLocalDb(url: string): void

/**
 * True for a libSQL WalConflict (diverged replica → wipe + re-pull); NOT transient
 * network/auth errors, which must not trigger a destructive wipe. See db.md.
 */
isReplicaConflict(err: unknown): boolean

/**
 * True when the db file at `url` is a libSQL embedded replica (has an `-info` sync-metadata sidecar). See db.md.
 */
isSyncReplica(url: string): boolean
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`store/db.ts`](db.md) ×4

## Tests

`tests/store/db-replica.test.ts`.

## Budget

27 / 500 lines (473 to spare).
<!-- END GENERATED MAP FACTS -->
