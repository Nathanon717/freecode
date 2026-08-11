# src/cli/undo.ts - undo Command

<!-- BEGIN GENERATED MAP INTENT -->
## Role

`freecode undo` — restores the project to the snapshot freecode took before an agent session's first write, lists the snapshots available, or shows what a restore would revert (`--diff`, `--semantic`). The snapshot library it drives is [../snapshots/index.md](../snapshots/index.md); the summary encoding is [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md).

## Read When

- Changing what `freecode undo` prints, its flags, or its exit codes.
- Debugging an undo that reported success but left the project wrong.
- Changing how a snapshot's changes are reviewed before deciding to restore.
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

- **Imports:** [`snapshots/index.ts`](../snapshots/index.md) ×8, [`snapshots/shadow-repo.ts`](../snapshots/shadow-repo.md) ×4, [`snapshots/semantic-diff.ts`](../snapshots/semantic-diff.md) ×1

## Tests

`tests/cli/undo.test.ts`.

## Budget

227 / 500 lines (273 to spare).
<!-- END GENERATED MAP FACTS -->

## Surface

| Invocation | Behavior |
| --- | --- |
| `freecode undo` | restores the most recent snapshot |
| `freecode undo <id>` | restores that snapshot |
| `freecode undo --list` | every snapshot, newest first, each with a `git diff --stat` of what changed since it, plus the `--git-dir` incantation for inspecting them by hand |
| `freecode undo --list -n <count>` | the newest `<count>` only, and a line saying how many were held back |
| `freecode undo --diff [<id>]` | the patch a restore would revert, instead of restoring |
| `freecode undo --diff --semantic` | that patch re-encoded by [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md) |

Exit 0 when there is nothing to undo — having nothing snapshotted is not a failure. Exit 1
only for a missing `git` binary, an unknown id, a non-positive `-n`, or a restore that threw.

## Why the parser is a loop rather than two `includes` calls

Two flags broke the old shape, and both broke it toward *restoring something nobody asked
to restore*:

- **`-n` takes a value.** The id used to be "the first token that is not a flag", so
  `undo --list -n 3` would have looked up a snapshot called `3`. Values are consumed where
  they are introduced instead.
- **`--semantic` implies `--diff`.** argv reaching `undo` still carries process-level flags
  meant for the rest of freecode, so unrecognised flags cannot be rejected. That leaves the
  destructive branch as the fallthrough for anything unparsed, and a review flag must never
  land there.

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
