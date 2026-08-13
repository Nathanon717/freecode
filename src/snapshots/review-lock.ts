/**
 * @role One edit-enabled `-p` run per project at a time: the claim a delegated run takes before its first turn and holds until its work is accepted or reverted. Nothing else in freecode consults it — see [../cli/headless-prompt.md](../cli/headless-prompt.md) for who claims and [../cli/checkpoint.md](../cli/checkpoint.md) for who releases.
 *
 * @readwhen
 * - Changing which runs are mutually exclusive, or what frees a lock.
 * - A `-p --edit` run was refused and the holder it named was long gone, or was refused naming no holder at all.
 * - Adding a second kind of lock over a project.
 */

// Serialising delegated edits is what makes "the newest snapshot" a safe thing
// to key review on. With two `-p --edit` runs overlapping, `checkpoint diff`
// would answer about whichever snapshot happened to be newer, and be silently
// wrong rather than loudly wrong. The alternative — handing each run's snapshot
// id back to its caller and threading it through every review command — is a
// bigger change than the problem currently justifies (docs/undo-snapshots-plan.md).
//
// It is a *lock file next to* the shadow repo rather than inside it, so claiming
// one never has to `git init`: a run that turns out to write nothing must not be
// the thing that creates a project's snapshot store.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { shadowRepoPath } from './shadow-repo.js';

export interface ReviewLock {
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
export function reviewLockPath(projectRoot: string): string {
  return `${shadowRepoPath(projectRoot).path.replace(/\.git$/, '')}.review-lock`;
}

/** What a claim attempt found. `unavailable` is a refusal, not a warning — see {@link claimReviewLock}. */
export type ReviewLockClaim =
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
export function claimReviewLock(projectRoot: string, task: string): ReviewLockClaim {
  const path = reviewLockPath(projectRoot);
  const mine: ReviewLock = { pid: process.pid, startedAt: new Date().toISOString(), task };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(mine), { encoding: 'utf-8', flag: 'wx' });
    return { status: 'claimed' };
  } catch (error) {
    const held = readReviewLock(projectRoot);
    if (held) return { status: 'held', held };
    // Ask the filesystem, not the errno: `mkdirSync` raises EEXIST for a *file*
    // sitting where the snapshots directory belongs, which is a broken store and
    // not a lock file at all. A lock file that is really there is the half a human
    // can clear, and it is the only half worth naming a path for.
    return {
      status: 'unavailable',
      cause: existsSync(path) ? 'unreadable-lock' : 'store-unwritable',
      path,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** The claim currently held over this project, if any. */
export function readReviewLock(projectRoot: string): ReviewLock | undefined {
  try {
    const raw = JSON.parse(readFileSync(reviewLockPath(projectRoot), 'utf-8')) as Partial<ReviewLock>;
    return {
      pid: Number(raw.pid) || 0,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
      task: typeof raw.task === 'string' ? raw.task : '',
      ...(typeof raw.snapshotId === 'string' && raw.snapshotId ? { snapshotId: raw.snapshotId } : {}),
      ...(raw.snapshotFailed === true ? { snapshotFailed: true } : {}),
    };
  } catch {
    return undefined;
  }
}

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
export function recordLockSnapshot(
  projectRoot: string,
  outcome: { snapshotId?: string; snapshotFailed?: boolean },
): void {
  const held = readReviewLock(projectRoot);
  if (!held || held.pid !== process.pid) return;
  try {
    writeFileSync(reviewLockPath(projectRoot), JSON.stringify({ ...held, ...outcome }), 'utf-8');
  } catch {
    // See above: advisory.
  }
}

/** Frees the project for the next delegated run. Silent when nothing was held. */
export function releaseReviewLock(projectRoot: string): void {
  rmSync(reviewLockPath(projectRoot), { force: true });
}
