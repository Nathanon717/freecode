# src/cli/undo.ts - undo Command

<!-- BEGIN GENERATED MAP INTENT -->
## Role

`freecode undo` — restores the project to the snapshot freecode took before an agent session's first write, or lists the snapshots available. The snapshot library it drives is [../snapshots/index.md](../snapshots/index.md).

## Read When

- Changing what `freecode undo` prints, its flags, or its exit codes.
- Debugging an undo that reported success but left the project wrong.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface UndoOptions {
  projectRoot: string;
  /** Remaining argv after the `undo` verb. */
  args: string[];
}

/**
 * Returns the process exit code.
 */
runUndo({ projectRoot: startDir, args }: UndoOptions): Promise<number>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/index.ts`](../snapshots/index.md) ×6, [`snapshots/shadow-repo.ts`](../snapshots/shadow-repo.md) ×4

## Tests

`tests/cli/undo.test.ts`.

## Budget

158 / 500 lines (342 to spare).
<!-- END GENERATED MAP FACTS -->

## Surface

| Invocation | Behavior |
| --- | --- |
| `freecode undo` | restores the most recent snapshot |
| `freecode undo <id>` | restores that snapshot |
| `freecode undo --list` | every snapshot, newest first, each with a `git diff --stat` of what changed since it, plus the `--git-dir` incantation for inspecting them by hand |

Exit 0 when there is nothing to undo — having nothing snapshotted is not a failure. Exit 1
only for a missing `git` binary, an unknown id, or a restore that threw.

## Placement in src/index.ts

Resolved from `args[0]` **before** every `indexOf`-based flag scan, which would otherwise
match an argument meant for `undo`. It returns before readline and the store are created, so
it has no teardown to do and never loads the ai SDK.

## Finding the right project

Snapshots are keyed on the directory freecode was launched from, and someone reaching for
`undo` is rarely standing in it. So the start directory is not taken at face value:

1. Walk up from the cwd looking for a shadow repo, bounded by the enclosing git toplevel so
   this can never reach into a parent project. A match prints which root it is using.
2. Failing that, `listShadowProjects()` names any snapshotted directory *below* the cwd —
   "no snapshots" would be a wrong answer when freecode was launched one level down.

Both paths still exit 0. Having nothing to undo is not a failure.
