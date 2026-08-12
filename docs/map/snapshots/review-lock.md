# src/snapshots/review-lock.ts - Review Lock

<!-- BEGIN GENERATED MAP INTENT -->
## Role

One edit-enabled `-p` run per project at a time: the claim a delegated run takes before its first turn and holds until its work is accepted or reverted. Nothing else in freecode consults it — see [../cli/headless-prompt.md](../cli/headless-prompt.md) for who claims and [../cli/checkpoint.md](../cli/checkpoint.md) for who releases.

## Read When

- Changing which runs are mutually exclusive, or what frees a lock.
- A `-p --edit` run was refused and the holder it named was long gone.
- Adding a second kind of lock over a project.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface ReviewLock {
  /** Process that claimed it. Recorded for the refusal message, never acted on. */
  pid: number;
  startedAt: string;
  /** First line of what the run was asked to do, so a refusal can say whose work is waiting. */
  task: string;
}

/**
 * Takes the lock, or returns the claim already holding it.
 *
 * The write is exclusive (`wx`), so two runs starting in the same instant cannot
 * both succeed — the check and the claim are one operation, which a read
 * followed by a write would not be.
 */
claimReviewLock(projectRoot: string, task: string): ReviewLock | undefined

/**
 * The claim currently held over this project, if any.
 */
readReviewLock(projectRoot: string): ReviewLock | undefined

/**
 * Frees the project for the next delegated run. Silent when nothing was held.
 */
releaseReviewLock(projectRoot: string): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/shadow-repo.ts`](shadow-repo.md) ×1
- **Imported by:** [`cli/checkpoint.ts`](../cli/checkpoint.md) ×3

## Tests

`tests/snapshots/review-lock.test.ts`. 2 other test files reference it.

## Budget

67 / 500 lines (433 to spare).
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
| that run ends having written | keeps it — including when the turn errored or threw |
| `freecode checkpoint accept` | frees it, after taking the baseline snapshot |
| `freecode checkpoint revert` | frees it, after restoring |

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

## The release condition has one owner

`sessionSnapshotId()` in [auto.md](auto.md) is the single answer to "does this run have
unreviewed work?". `headless-prompt.ts` asks it in a `finally` rather than tracking its own
flag, because two flags can disagree and only one of them would be right.

A snapshot that was *attempted and failed* counts as no snapshot, deliberately. The writes
did happen, but there is no checkpoint to review them against — holding the lock for one
would leave the project stuck with nothing able to clear it. The failure is already logged
loudly by `auto.ts`.

## Recovering a stale lock

A run killed mid-write leaves the lock held, which is correct: its changes really are
unreviewed. `freecode checkpoint accept` and `freecode checkpoint revert` are both ways out,
and `accept` deliberately works even when the project has no snapshots at all — otherwise a
run that died before its snapshot landed would leave a lock nothing could free.
