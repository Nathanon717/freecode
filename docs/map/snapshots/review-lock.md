# src/snapshots/review-lock.ts - Review Lock

<!-- BEGIN GENERATED MAP INTENT -->
## Role

One edit-enabled `-p` run per project at a time: the claim a delegated run takes before its first turn and holds until its work is accepted or reverted. Nothing else in freecode consults it — see [../cli/headless-prompt.md](../cli/headless-prompt.md) for who claims and [../cli/checkpoint.md](../cli/checkpoint.md) for who releases.

## Read When

- Changing which runs are mutually exclusive, or what frees a lock.
- A `-p --edit` run was refused and the holder it named was long gone, or was refused naming no holder at all.
- Adding a second kind of lock over a project.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface ReviewLock {
  /** Process that claimed it. Recorded for the refusal message, and for {@link recordLockSnapshot}. */
  pid: number;
  startedAt: string;
  /** First line of what the run was asked to do, so a refusal can say whose work is waiting. */
  task: string;
  /**
   * The snapshot the holding run took, written back once it has one.
   *
   * What makes "the delegated run's snapshot" an exact answer rather than a guess
   * from timestamps: an interactive session snapshotting in the same window is
   * indistinguishable by `takenAt` alone. Absent on a run killed before it
   * finished, where `checkpoint` falls back to that guess.
   */
  snapshotId?: string;
  /** The holding run wrote and its snapshot failed, so no snapshot marks where its work began. */
  snapshotFailed?: boolean;
}

/**
 * Where this project's lock file lives.
 *
 * Exported because deleting it by hand is the genuine last resort, and a message
 * that recommends it has to name it. Nothing outside an error path should be
 * reaching for this — claim, read and release are the interface.
 */
reviewLockPath(projectRoot: string): string

/**
 * What a claim attempt found. `unavailable` is a refusal, not a warning — see {@link claimReviewLock}.
 */
type ReviewLockClaim =
  /** The lock is now ours, and stays ours until it is accepted or reverted. */
  | { status: 'claimed' }
  /** Another delegated run's work is waiting to be reviewed. */
  | { status: 'held'; held: ReviewLock }
  /**
   * Neither claimable nor readable, so *whether* one is held is unknown. `cause`
   * separates the two, because only one of them has a fix: a lock file that is
   * there and unparseable is deleted by hand, while an unwritable store cannot be
   * repaired through freecode at all — `checkpoint accept`, the documented way out
   * of a stuck lock, has to write the same store to take its baseline. `path` is
   * the lock file either way, and is worth printing only in the first case.
   */
  | {
      status: 'unavailable';
      cause: 'unreadable-lock' | 'store-unwritable';
      path: string;
      reason: string;
    };

/**
 * Takes the lock, reports the claim already holding it, or reports that it could
 * not tell.
 *
 * The write is exclusive (`wx`), so two runs starting in the same instant cannot
 * both succeed — the check and the claim are one operation, which a read
 * followed by a write would not be.
 *
 * A write that fails is *not* an unheld lock. Either the lock is held, or the
 * store is unwritable, and reading it back tells the two apart; when the readback
 * also fails, the answer is unknown and the only safe reading of unknown is no.
 * Treating it as "proceed" — which is what this used to do — silently disabled
 * mutual exclusion for exactly the case where the snapshot store is broken, i.e.
 * where the review the lock is protecting is least likely to be possible at all.
 * The path, the underlying error, and which of the two cases it is travel with the
 * refusal so the caller can say what to do rather than leaving a mystery lockout.
 */
claimReviewLock(projectRoot: string, task: string): ReviewLockClaim

/**
 * The claim currently held over this project, if any.
 */
readReviewLock(projectRoot: string): ReviewLock | undefined

/**
 * Records how the holding run's snapshot went, so `freecode checkpoint` can name
 * its snapshot exactly instead of inferring one from timestamps.
 *
 * Only the holder writes, and only over a lock that is already there: this is an
 * update, never a claim. Doing it any other way would let a process that lost the
 * race — or one that never held anything — create a lock out of an ordinary
 * bookkeeping call, which is the opposite of what `claimReviewLock`'s exclusive
 * `wx` write is for.
 *
 * Advisory, so a failed write is swallowed: the lock's job is mutual exclusion and
 * it is already doing that. Losing this field only costs `checkpoint` its exact
 * answer and drops it back to the guess it made before.
 */
recordLockSnapshot(projectRoot: string, outcome: { snapshotId?: string | undefined; snapshotFailed?: boolean | undefined; }): void

/**
 * Frees the project for the next delegated run. Silent when nothing was held.
 */
releaseReviewLock(projectRoot: string): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/shadow-repo.ts`](shadow-repo.md) ×1
- **Imported by:** [`cli/checkpoint.ts`](../cli/checkpoint.md) ×6

## Tests

`tests/snapshots/review-lock.test.ts`. 2 other test files reference it.

## Budget

153 / 500 lines (347 to spare).
<!-- END GENERATED MAP FACTS -->

## What it is for

`freecode checkpoint diff` reviews **the newest snapshot**. That is only a safe thing to key
on while at most one unreviewed edit run exists — otherwise two overlapping `-p --edit`
delegations produce two snapshots, and the review command answers about whichever happens to
be newer without saying so. Wrong, and quietly.

The considered alternative is to hand each run its own snapshot id back and thread it through
every review command. That is the better long-run answer and it is written up in
[../../undo-snapshots-plan.md](../../undo-snapshots-plan.md); serialising the runs is the
cheaper one, and it makes the ambiguity impossible rather than merely detectable.

## Who claims and who frees

| Event | Effect |
| --- | --- |
| `-p --edit` starts | claims, or is refused and exits 1 naming the holder |
| that run ends having written nothing | frees it immediately |
| that run ends having written | keeps it — including when the turn errored or threw — and records its snapshot id in it |
| that run ends having written with **no** snapshot | keeps it, marked `snapshotFailed` |
| `freecode checkpoint accept` | frees it, after taking the baseline snapshot |
| `freecode checkpoint revert` | frees it, after restoring — unless the revert did not finish |

**Interactive and `--script` sessions neither claim nor check.** They still snapshot, so
their work is still recoverable; what they are not is unattended. Blocking a human mid-session
on a review workflow they did not opt into would be the wrong trade, and a watched session is
its own review.

## Two details that are load-bearing

**The claim is `writeFile(..., { flag: 'wx' })`.** Exclusive creation makes the check and the
claim one operation. A read-then-write would let two runs starting in the same instant both
see an empty project and both proceed — the exact race the lock exists to remove.

**The lock file sits beside the shadow repo, not inside it.** Claiming happens before the
first turn, and most runs never write; putting the lock inside the git dir would make an
edit-enabled run that turns out to change nothing be the thing that `git init`s a project's
snapshot store. The path is the shadow repo's, with `.git` swapped for `.review-lock`.

## A claim that cannot be made is a refusal

`claimReviewLock` answers with one of three things, and only `claimed` means proceed:

| Outcome | Means |
| --- | --- |
| `claimed` | the exclusive write succeeded; the lock is ours |
| `held` | the write failed and the file read back as someone's claim |
| `unavailable` | the write failed **and** the readback failed, so nothing is known |

The third used to be reported as "no lock held", which silently turned mutual exclusion off in
exactly the case where the snapshot store is broken — i.e. where the review the lock protects is
least likely to be possible at all (finding B11 in
[../../agent-containment-audit.md](../../agent-containment-audit.md)). Unknown now reads as no.

It carries the lock path, the underlying error, and a `cause` — because the two shapes of
`unavailable` have different fixes, and only one of them has a fix at all:

- `unreadable-lock` (the lock file is really on disk) — there and unparseable, which a run killed
  mid-write leaves behind. Delete it.
- `store-unwritable` (no lock file at that path) — nothing in freecode repairs this. `checkpoint accept`,
  which [../cli/checkpoint.md](../cli/checkpoint.md) documents as the way out of a stuck lock, has
  to write the same store to take its baseline, so it fails too. Fix permissions, or point
  `FREECODE_HOME` somewhere writable.

Fail-closed without that distinction trades a silent hole for a mystery lockout, and worse, sends
half of the cases after a file that does not exist. The split is `existsSync` on the lock path
rather than the errno, because `mkdirSync` raises `EEXIST` for a *file* sitting where the snapshots
directory belongs — a broken store wearing the errno of a held lock.

## The release condition has one owner

`sessionSnapshot()` in [auto.md](auto.md) is the single answer to "does this run have
unreviewed work, and is it reviewable?". `headless-prompt.ts` asks it in a `finally` rather
than tracking its own flag, because two flags can disagree and only one of them would be right.

It answers three ways, and a snapshot that was *attempted and failed* is its own state rather
than being folded into "no snapshot" — see the table in [auto.md](auto.md). That fold is
finding A5/A6: the writes had happened, nothing covered them, and the lock was released anyway.

## The lock carries the run's snapshot id

Serialising the runs was chosen over threading each run's snapshot id through every review
command, and the section above still records why. R4 added the *narrow* version of the rejected
idea, which costs nothing extra: the holder writes its own snapshot id back into the lock it is
already holding, and `outstanding()` in [../cli/checkpoint.md](../cli/checkpoint.md) reads it
instead of inferring one from timestamps. Timestamps cannot separate the delegated run's
snapshot from an interactive session's taken in the same window; the id can.

`recordLockSnapshot` is an **update, never a claim**. It refuses to write when there is no lock
to update, and when the lock on disk belongs to another pid — the exclusive `wx` write is the
whole mutual-exclusion mechanism, and a bookkeeping call that could conjure a lock out of
nothing would let a process that never held one lock the project. It is also advisory: a failed
write is swallowed, and `outstanding()` drops back to the timestamp guess it made before.

## Recovering a stale lock

A run killed mid-write leaves the lock held, which is correct: its changes really are
unreviewed. `freecode checkpoint accept` and `freecode checkpoint revert` are both ways out,
and `accept` deliberately works even when the project has no snapshots at all — otherwise a
run that died before its snapshot landed would leave a lock nothing could free.

A *half-written* lock file is the one case with no route through freecode: nothing can read a
holder out of it, so claiming reports `unavailable` and the next `-p --edit` is refused until
the file is deleted by hand. The refusal names the path for that reason. Reading paths
(`readReviewLock`, and so `outstanding()`) treat it as no lock, which is right — they act on a
holder they can see, and there is none.
