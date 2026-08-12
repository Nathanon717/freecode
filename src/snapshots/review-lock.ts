/**
 * @role One edit-enabled `-p` run per project at a time: the claim a delegated run takes before its first turn and holds until its work is accepted or reverted. Nothing else in freecode consults it — see [../cli/headless-prompt.md](../cli/headless-prompt.md) for who claims and [../cli/checkpoint.md](../cli/checkpoint.md) for who releases.
 *
 * @readwhen
 * - Changing which runs are mutually exclusive, or what frees a lock.
 * - A `-p --edit` run was refused and the holder it named was long gone.
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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { shadowRepoPath } from './shadow-repo.js';

export interface ReviewLock {
  /** Process that claimed it. Recorded for the refusal message, never acted on. */
  pid: number;
  startedAt: string;
  /** First line of what the run was asked to do, so a refusal can say whose work is waiting. */
  task: string;
}

function lockPath(projectRoot: string): string {
  return `${shadowRepoPath(projectRoot).path.replace(/\.git$/, '')}.review-lock`;
}

/**
 * Takes the lock, or returns the claim already holding it.
 *
 * The write is exclusive (`wx`), so two runs starting in the same instant cannot
 * both succeed — the check and the claim are one operation, which a read
 * followed by a write would not be.
 */
export function claimReviewLock(projectRoot: string, task: string): ReviewLock | undefined {
  const path = lockPath(projectRoot);
  const mine: ReviewLock = { pid: process.pid, startedAt: new Date().toISOString(), task };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(mine), { encoding: 'utf-8', flag: 'wx' });
    return undefined;
  } catch {
    // Either the lock is held, or the store is unwritable. Reading it back tells
    // the two apart: a held lock has contents to report, and anything else must
    // not block the run — a broken safety net may not become a broken freecode.
    return readReviewLock(projectRoot);
  }
}

/** The claim currently held over this project, if any. */
export function readReviewLock(projectRoot: string): ReviewLock | undefined {
  try {
    const raw = JSON.parse(readFileSync(lockPath(projectRoot), 'utf-8')) as Partial<ReviewLock>;
    return {
      pid: Number(raw.pid) || 0,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
      task: typeof raw.task === 'string' ? raw.task : '',
    };
  } catch {
    return undefined;
  }
}

/** Frees the project for the next delegated run. Silent when nothing was held. */
export function releaseReviewLock(projectRoot: string): void {
  rmSync(lockPath(projectRoot), { force: true });
}
