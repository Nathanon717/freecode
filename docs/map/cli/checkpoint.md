# src/cli/checkpoint.ts - checkpoint Command

<!-- BEGIN GENERATED MAP INTENT -->
## Role

`freecode checkpoint` — the review surface over the snapshot taken before a session's first write: `list` what exists, `diff` what changed, then `revert` it or `accept` it as the new baseline. Drives [../snapshots/index.md](../snapshots/index.md), prints [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md), and frees [../snapshots/review-lock.md](../snapshots/review-lock.md).

## Read When

- Changing what `freecode checkpoint` prints, its subcommands, its flags, or its exit codes.
- Debugging a revert that reported success but left the project wrong.
- Changing how a delegated change is reviewed or what frees the project for the next one, and debugging `accept`/`revert` refused as a review decision — that refusal reads the `FREECODE_SANDBOXED` marker set by [../agent/tools/shell.md](../agent/tools/shell.md).
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

- **Imports:** [`snapshots/index.ts`](../snapshots/index.md) ×17, [`snapshots/review-lock.ts`](../snapshots/review-lock.md) ×6, [`cli/checkpoint-root.ts`](checkpoint-root.md) ×2, [`snapshots/shadow-repo.ts`](../snapshots/shadow-repo.md) ×2, [`cli/args.ts`](args.md) ×1, [`snapshots/coverage.ts`](../snapshots/coverage.md) ×1, [`snapshots/semantic-diff.ts`](../snapshots/semantic-diff.md) ×1

## Tests

`tests/cli/checkpoint.test.ts`.

## Budget

467 / 500 lines (33 to spare).

## Env

`FREECODE_SANDBOXED`
<!-- END GENERATED MAP FACTS -->

## Surface

| Invocation | Behavior |
| --- | --- |
| `freecode checkpoint` | same as `list` — the bare word is a read, never an action |
| `freecode checkpoint list [-n <count>]` | every snapshot, newest first, each with a `git diff --stat` of what changed since it, plus the `--git-dir` incantation for inspecting them by hand; `-n` shows the newest `<count>` and says how many were held back |
| `freecode checkpoint diff [<id>]` | what a revert would undo, re-encoded by [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md), then any change to `.git/config` or `.git/hooks/` as a raw patch below it |
| `freecode checkpoint diff --patch` | the same change as the raw unified patch, with the same `.git` section |
| `freecode checkpoint revert [<id>]` | puts the project back — ignored files and `.git` included — frees the review lock, and names any excluded path it left alone |
| `freecode checkpoint revert`, `.git` not restorable | exit 1, lock **kept**: files are back, `.git` is not, and repeating the command is the repair |
| `freecode checkpoint revert`, a file locked by another process | exit 1, lock **kept**: everything else is back and the paths that are not are named ([../snapshots/locked-files.md](../snapshots/locked-files.md)) |
| `freecode checkpoint diff`/`revert`, delegated run has no snapshot | exit 1, refused: every snapshot in the store belongs to someone else, so answering would be worse than not |
| `freecode checkpoint accept` | takes a fresh snapshot as the reviewed baseline, and frees the review lock |
| either of those under `FREECODE_SANDBOXED` | refused, exit 1, nothing written — see below |

Exit 0 when there is nothing to revert — having nothing snapshotted is not a failure. Exit 1
for a missing `git` binary, an unparseable command line, an unknown id, a non-positive `-n`,
or a revert or accept that threw.

`accept` is the one verb that runs before the "no snapshots here" early return, because it
*takes* a snapshot rather than reading one — and because it has to stay reachable as the way
out of a lock left by a run that died before its own snapshot landed. It takes no id either:
there is no such thing as accepting an older snapshot, only reverting to one.

**An `accept` that cannot take its baseline keeps the lock and names the lock file.** Keeping it
is right — accepting with no baseline would let the next delegated run start against a state
nothing can restore — but this is the one failure that can strand someone. `accept` is exactly
where R4's stderr report and the `unsnapshotted` refusal both send people, and the store it must
write is the same store whose breakage sent them there.
[../snapshots/review-lock.md](../snapshots/review-lock.md) already draws this distinction for its
own refusal (`store-unwritable` has no route through freecode); saying "run accept" and stopping
would be the half of it that misdirects. So the error names the path and says deleting it by hand
is the last resort.

## The `.git` section of a diff

`diff` prints two things: the project's changes, summarised or raw, and then whatever changed
inside `.git/config` and `.git/hooks/` — **always raw, in both modes**. A `core.hooksPath` pointing
somewhere new is the entire content of finding A3, and it means nothing summarised.

It is deliberately just those two paths. Refs, logs and objects churn on every git command an
agent runs, and a diff nobody reads is not review coverage; the trade is that a deleted branch is
*recovered* by a revert without being *shown* by the diff ([../snapshots/gitdir.md](../snapshots/gitdir.md)).

A change confined to `.git` is still a change, so it suppresses "No changes since snapshot" in
`diff` **and** "(no changes since this snapshot)" in `list`, which gets a flagged line pointing at
`diff` rather than a stat of its own. Both matter for the same reason: a `core.hooksPath` edit
leaves the worktree spotless, so the finding's own signature is precisely the case where those
lines would have been false.

## A revert that did not finish is a failure, not a footnote

Either half left undone exits 1, prints "Partly reverted", and **keeps the review lock**:

- **`.git` would not go back.** The worktree half is real and is kept; what fails leaves refs
  rolled back against a stale index, `fsck` complaining, and possibly the agent's own
  `core.hooksPath` still set.
- **A file could not be written.** Another process holds it, so it still contains exactly what the
  agent put there ([../snapshots/locked-files.md](../snapshots/locked-files.md)). Everything else
  is back, and the paths that are not are named.

Releasing the lock in either case would mark unreverted work as reviewed and admit the next
delegated run against it — the same mistake R4 fixes on the snapshot side. Since
`read-tree -u --reset` is idempotent, running the same command again once the holder lets go
finishes the job, and the outstanding lock is what keeps that command pointed at the same
snapshot. For a holder that never lets go — a dev server on its database — `checkpoint accept` is
the honest end of the review.

The locked-file case used to be worse than a bad message. A file git had to *delete* and could not
was a `warning:` on a **zero exit**, so the agent's file survived the revert and `checkpoint`
reported complete success.

## `accept` and `revert` refuse inside an agent's shell

Both exit 1 without touching anything when `FREECODE_SANDBOXED` is set, which
[../agent/tools/shell.md](../agent/tools/shell.md) stamps on every child it spawns. freecode's
control plane is a CLI on `$PATH` and `shell_exec` is a shell, so the run being reviewed could
review itself: one `checkpoint accept` freed the lock, took a fresh baseline that made
`checkpoint diff` report "No changes", left the work on disk, and cleared the way for the next
delegation (finding A1 in [../../agent-containment-audit.md](../../agent-containment-audit.md),
demonstrated end to end). `revert` is the same hole pointed the other way — it destroys the
evidence, along with any concurrent human edits in the tree.

The check runs **before** `resolveSnapshotRoot`, because `accept` snapshots first and releases
the lock second: a refusal any later would still leave an agent-triggered baseline in
`checkpoint list`. `list` and `diff` stay available — reading is not approving, and an agent
asked to describe its own diff should be able to.

The marker is deliberately weak; `env -u FREECODE_SANDBOXED` defeats it, because a shell cannot
be made to lie to its own child. It holds the line until C1 of
[../../agent-containment-plan.md](../../agent-containment-plan.md), where no `freecode` binary
and no snapshot store exist inside the sandbox at all.

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

`outstanding()` answers in three steps, and only the middle one is a guess:

1. **The id the lock recorded.** A `-p --edit` run writes its own snapshot id back into the lock
   on the way out ([../snapshots/review-lock.md](../snapshots/review-lock.md)), so the usual
   answer is exact. Timestamps cannot separate the delegated run's snapshot from an interactive
   session's taken in the same window; the id can. A recorded id whose snapshot has since been
   pruned falls through rather than dead-ending.
2. **Failing that, the oldest snapshot taken at or after the lock's `startedAt`** — the fallback
   for a run killed before it recorded one. Both are `toISOString()` output, so the comparison is
   a string one. Anything that landed on top is then *shown* rather than hidden, which is the
   right way round: an edit the reviewer did not expect is exactly what they need to see.
3. **`'unsnapshotted'`** when the lock says the run's snapshot *failed*. There is no snapshot of
   the run's at all, so the walk above would happily pick a concurrent session's post-damage
   one — reporting a clean diff, and a successful revert, against a state nobody has reviewed.
   The bare verb is refused instead, pointing at `git diff`, `checkpoint accept`, and naming an id
   explicitly. Naming one still works: that is a deliberate choice about a specific snapshot
   rather than a guess made on the user's behalf.

With no lock held this is the newest snapshot, exactly as before.

`reportNoSnapshots` answers for the same case one step earlier, because it returns before
`outstanding()` is ever consulted: a run that wrote and could not snapshot leaves the store *empty*,
and "freecode takes one before an agent session's first write" would then read as "nothing happened
here" about a project the agent has already changed. `diff` and `revert` divert to the same
refusal; `list` does not, having nothing to be wrong about.

## Finding the right project

Snapshot-root discovery lives in [checkpoint-root.md](checkpoint-root.md). Snapshots are keyed
on the directory freecode was launched from, and someone reaching for a checkpoint is rarely
standing in it. So the start directory is not taken at face value:

1. Walk up from the cwd looking for a shadow repo, bounded by Git's relative route to the
   enclosing toplevel so this cannot reach a parent project or lose Windows 8.3 path spelling.
   A match prints which root it is using.
2. Failing that, `listShadowProjects()` names any snapshotted directory *below* the cwd —
   "no snapshots" would be a wrong answer when freecode was launched one level down.

Both paths still exit 0. Having nothing to revert is not a failure.

## Why `diff` summarises by default

The reader this is written for is a lead agent reviewing a delegated edit while holding the
rest of its work in the same context window, so the terse encoding is the one it should get
without asking. `--patch` is there for when the summary is not enough — and the summary is
built so that is rare: nothing is dropped, only collapsed, and anything that cannot be
classified with certainty is printed verbatim.
