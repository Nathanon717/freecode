# src/snapshots/auto.ts - Automatic Snapshot

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The automatic half of undo: one snapshot per process, taken lazily immediately before the first write-tool call. Kept separate from [index.md](index.md) so the snapshot library stays callable more than once per process.

## Read When

- Changing when the automatic snapshot fires, or what happens when it fails.
- Debugging a session that snapshotted twice, or one that captured post-mutation state.
- Changing the retention count applied after each automatic snapshot.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Snapshots the project the first time it is called in this process, and is a
 * no-op every time after.
 *
 * Never rejects. A missing `git` binary, an unwritable config dir, or a corrupt
 * shadow repo must not block the write this was protecting — refusing writes
 * because the safety net is unavailable inverts the point of having one, so the
 * failure is logged and the call proceeds unprotected.
 */
ensureSnapshot(): Promise<void>

/**
 * Test-only: drops the memo so a fresh snapshot can be taken in the same process.
 */
resetSnapshotMemo(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×2, [`snapshots/index.ts`](index.md) ×2, [`agent/workspace.ts`](../agent/workspace.md) ×1
- **Imported by:** [`agent/tools/snapshot-gate.ts`](../agent/tools/snapshot-gate.md) ×1

## Tests

`tests/snapshots/auto.test.ts`. 1 other test file references it.

## Budget

47 / 500 lines (453 to spare).
<!-- END GENERATED MAP FACTS -->

## Why the memo is at module scope

`createTools()` state is per streamText attempt, not per session. A run-once flag threaded
through it would re-snapshot every turn, and the second snapshot would capture
*post-mutation* state — destroying the thing being protected. One promise per process is the
only scope that means "before the agent touched anything".

The promise is assigned synchronously before the first await, so concurrent first writes
share it instead of each starting a snapshot.

## Failure is not fatal

`ensureSnapshot()` never rejects. A missing `git` binary or an unwritable config dir is
logged and the write proceeds unprotected — refusing writes because the safety net is
unavailable inverts the point of having one.
