# src/cli/checkpoint-root.ts - Checkpoint Project Discovery

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Locates the project whose snapshots a `freecode checkpoint` command should use when invoked from elsewhere in or above the project. Kept separate from [checkpoint.md](checkpoint.md), which owns the command surface and review actions.

## Read When

- A checkpoint command run from a project subdirectory cannot find snapshots or restores from the wrong store.
- Changing how checkpoint discovery is bounded or how nearby snapshot projects are classified.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
isUnder(ancestor: string, candidate: string): boolean

/**
 * Walks up from `startDir` until a shadow repo turns up, bounded by the
 * enclosing repository so discovery cannot enter a parent project.
 *
 * Git's relative route back to the top is deliberate: `--show-toplevel`
 * expands an 8.3 Windows path to its long spelling. The snapshot store is keyed
 * by the caller's spelling, so that canonicalisation makes the real root look
 * unrelated and impossible to find.
 */
resolveSnapshotRoot(startDir: string): Promise<string | undefined>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/shadow-repo.ts`](../snapshots/shadow-repo.md) ×2
- **Imported by:** [`cli/checkpoint.ts`](checkpoint.md) ×2

## Tests

`tests/cli/checkpoint-root.test.ts`.

## Budget

34 / 500 lines (466 to spare).
<!-- END GENERATED MAP FACTS -->
