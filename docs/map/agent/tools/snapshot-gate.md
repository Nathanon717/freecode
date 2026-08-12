# src/agent/tools/snapshot-gate.ts - Snapshot Gate

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The innermost wrapper in the tool stack: takes the session's checkpoint snapshot immediately before the first write tool actually executes. Composed by `wrap` in [wrappers.md](wrappers.md).

## Read When

- Changing which tools arm the checkpoint net, or where in the wrapper stack it is armed.
- Debugging a snapshot that captured post-mutation state, or one that never fired.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Arms the checkpoint net for `create`, `edit`, and `shell_exec`; every other tool passes through untouched.
 */
withSnapshotGate(name: string, t: AnyCoreTool): AnyCoreTool
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`agent/tools/wrappers.ts`](wrappers.md) ×2, [`agent/tools/tool-names.ts`](tool-names.md) ×1, [`snapshots/auto.ts`](../../snapshots/auto.md) ×1
- **Imported by:** [`agent/tools/wrappers.ts`](wrappers.md) ×1

## Tests

`tests/agent/tools/snapshot-gate.test.ts`.

## Budget

29 / 500 lines (471 to spare).
<!-- END GENERATED MAP FACTS -->

## Why innermost

Composed inside every other wrapper by `wrap` in [wrappers.md](wrappers.md), so it fires
exactly when the raw tool is about to mutate:

- a denied call never reaches it;
- a read-only tool's pre-confirmation precompute never reaches it;
- a future `requiresConfirmation = false` cannot route around it, unlike a hook bolted onto
  the approval path;
- it sits inside `withSerializedExecution`'s queue, so two write calls in one step cannot
  race to snapshot.
