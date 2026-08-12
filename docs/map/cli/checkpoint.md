# src/cli/checkpoint.ts - checkpoint Command

<!-- BEGIN GENERATED MAP INTENT -->
## Role

`freecode checkpoint` — the review surface over the snapshot taken before a session's first write: `list` what exists, `diff` what changed, then `revert` it or `accept` it as the new baseline. Drives [../snapshots/index.md](../snapshots/index.md), prints [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md), and frees [../snapshots/review-lock.md](../snapshots/review-lock.md).

## Read When

- Changing what `freecode checkpoint` prints, its subcommands, its flags, or its exit codes.
- Debugging a revert that reported success but left the project wrong.
- Changing how a delegated change is reviewed, or what frees the project for the next one.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface CheckpointOptions {
  projectRoot: string;
  /** Remaining argv after the `checkpoint` verb. */
  args: string[];
}

/**
 * Returns the process exit code.
 */
runCheckpoint({ projectRoot: startDir, args }: CheckpointOptions): Promise<number>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/index.ts`](../snapshots/index.md) ×14, [`snapshots/shadow-repo.ts`](../snapshots/shadow-repo.md) ×4, [`snapshots/review-lock.ts`](../snapshots/review-lock.md) ×3, [`cli/args.ts`](args.md) ×1, [`snapshots/semantic-diff.ts`](../snapshots/semantic-diff.md) ×1

## Tests

`tests/cli/checkpoint.test.ts`.

## Budget

351 / 500 lines (149 to spare).
<!-- END GENERATED MAP FACTS -->

## Surface

| Invocation | Behavior |
| --- | --- |
| `freecode checkpoint` | same as `list` — the bare word is a read, never an action |
| `freecode checkpoint list [-n <count>]` | every snapshot, newest first, each with a `git diff --stat` of what changed since it, plus the `--git-dir` incantation for inspecting them by hand; `-n` shows the newest `<count>` and says how many were held back |
| `freecode checkpoint diff [<id>]` | what a revert would undo, re-encoded by [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md) |
| `freecode checkpoint diff --patch` | the same change as the raw unified patch |
| `freecode checkpoint revert [<id>]` | puts the project back, and frees the review lock |
| `freecode checkpoint accept` | takes a fresh snapshot as the reviewed baseline, and frees the review lock |

Exit 0 when there is nothing to revert — having nothing snapshotted is not a failure. Exit 1
for a missing `git` binary, an unparseable command line, an unknown id, a non-positive `-n`,
or a revert or accept that threw.

`accept` is the one verb that runs before the "no snapshots here" early return, because it
*takes* a snapshot rather than reading one — and because it has to stay reachable as the way
out of a lock left by a run that died before its own snapshot landed. It takes no id either:
there is no such thing as accepting an older snapshot, only reverting to one.

## Why a verb and not a flag

`undo` was one command whose *default* action was destructive: with no flag it recognised, a
mistyped review flag fell through to restoring the project. That is why `--semantic` used to
imply `--diff`. Here the only route to a write is typing `revert`, so the parser is free to
reject what it does not understand — an unknown subcommand and an unknown flag are both
named back rather than absorbed.

Two things still shape the loop:

- **`-n` takes a value.** The id cannot be "the first token that is not a flag", or
  `checkpoint list -n 3` would look up a snapshot called `3`. Values are consumed where they
  are introduced.
- **Process-level flags pass through.** This is dispatched off raw argv before the walk in
  [args.md](args.md) runs, so argv still carries flags aimed at the process — `-log`, and the
  `--script` the e2e harness appends after the verb. They are skipped, along with their
  values, on the authority of `processFlag()` in that same module. A second copy of the flag
  table here would drift; asking the owner cannot.

A flag belonging to another verb (`revert --patch`) is rejected too. It is always a mistake,
and the alternative is silently doing something other than what was asked.

## Placement in src/index.ts

Resolved from `args[0]` **before** every `indexOf`-based flag scan, which would otherwise
match an argument meant for `checkpoint`. It returns before readline and the store are
created, so it has no teardown to do and never loads the ai SDK. `-log` is read off raw argv
in that branch, because the shared handler for it sits past this early return.

## Which snapshot a bare `diff` or `revert` means

Not simply the newest — see `outstanding()`. The review lock serialises *delegated* runs
only, and an interactive or `--script` session still snapshots itself before its own first
write. One starting up between a delegation and its review therefore makes `snapshots[0]` a
point *after* the agent's work, and reviewing against it hides the change entirely while a
revert to it would keep the unreviewed work and report success.

While a claim is outstanding, the target is the oldest snapshot taken at or after the lock's
`startedAt` — the delegated run's own. Both are `toISOString()` output, so the comparison is
a string one. With no lock held, or none of the snapshots new enough to be the run's (killed
before it took one), this is the newest, exactly as before.

## Finding the right project

Snapshots are keyed on the directory freecode was launched from, and someone reaching for a
checkpoint is rarely standing in it. So the start directory is not taken at face value:

1. Walk up from the cwd looking for a shadow repo, bounded by the enclosing git toplevel so
   this can never reach into a parent project. A match prints which root it is using.
2. Failing that, `listShadowProjects()` names any snapshotted directory *below* the cwd —
   "no snapshots" would be a wrong answer when freecode was launched one level down.

Both paths still exit 0. Having nothing to revert is not a failure.

## Why `diff` summarises by default

The reader this is written for is a lead agent reviewing a delegated edit while holding the
rest of its work in the same context window, so the terse encoding is the one it should get
without asking. `--patch` is there for when the summary is not enough — and the summary is
built so that is rare: nothing is dropped, only collapsed, and anything that cannot be
classified with certainty is printed verbatim.
