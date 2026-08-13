import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  claimReviewLock,
  readReviewLock,
  recordLockSnapshot,
  releaseReviewLock,
} from '../../src/snapshots/review-lock.js';
import { shadowRepoPath } from '../../src/snapshots/shadow-repo.js';

let base = '';
let root = '';
let originalHome: string | undefined;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'freecode-lock-'));
  root = join(base, 'proj');
  originalHome = process.env['FREECODE_HOME'];
  process.env['FREECODE_HOME'] = join(base, 'home');
});

afterEach(() => {
  if (originalHome === undefined) delete process.env['FREECODE_HOME'];
  else process.env['FREECODE_HOME'] = originalHome;
  rmSync(base, { recursive: true, force: true });
});

describe('review lock', () => {
  it('lets the first claim through and hands the second the holder', () => {
    expect(claimReviewLock(root, 'first task')).toEqual({ status: 'claimed' });

    const claim = claimReviewLock(root, 'second task');
    expect(claim.status).toBe('held');
    if (claim.status !== 'held') return;
    expect(claim.held.task).toBe('first task');
    expect(claim.held.pid).toBe(process.pid);
    expect(claim.held.startedAt).not.toBe('');
  });

  it('frees the project again on release', () => {
    claimReviewLock(root, 'first task');
    releaseReviewLock(root);

    expect(readReviewLock(root)).toBeUndefined();
    expect(claimReviewLock(root, 'second task')).toEqual({ status: 'claimed' });
  });

  it('releasing an unheld lock is silent', () => {
    expect(() => releaseReviewLock(root)).not.toThrow();
  });

  // Claiming happens before the first turn and most runs never write. A lock
  // inside the git dir would make an edit run that changes nothing be the thing
  // that creates a project's snapshot store.
  it('claims without creating the shadow repo', () => {
    claimReviewLock(root, 'first task');

    const { path: shadowDir } = shadowRepoPath(root);
    expect(existsSync(shadowDir)).toBe(false);
    expect(readdirSync(join(base, 'home', 'snapshots'))).toEqual([
      `${shadowDir.split(/[\\/]/).pop()?.replace(/\.git$/, '')}.review-lock`,
    ]);
  });

  // A half-written or hand-edited lock file has no holder to report, so nothing
  // that only *reads* it can act on it. Claiming is the other half, below: a lock
  // that cannot be claimed and cannot be read is refused, not claimed over.
  it('treats an unreadable lock as absent', () => {
    claimReviewLock(root, 'first task');
    writeFileSync(lockFile(), 'not json', 'utf-8');

    expect(readReviewLock(root)).toBeUndefined();
  });

  // The fail-closed half (finding B11). "Unwritable and unreadable" used to mean
  // proceed, which silently disabled mutual exclusion for exactly the runs whose
  // snapshot store is broken. Refusing needs the path in the outcome, or the
  // caller can only report a mystery.
  it('refuses rather than proceeding when the lock can be neither claimed nor read', () => {
    claimReviewLock(root, 'first task');
    writeFileSync(lockFile(), 'not json', 'utf-8');

    const claim = claimReviewLock(root, 'second task');
    expect(claim.status).toBe('unavailable');
    if (claim.status !== 'unavailable') return;
    expect(claim.path).toBe(lockFile());
    expect(claim.reason).not.toBe('');
    // Deleting the file is the fix here, and only here — see the next case.
    expect(claim.cause).toBe('unreadable-lock');
  });

  it('refuses when the store cannot be written at all, and says which case it is', () => {
    // A file where the snapshots directory should be: mkdirSync and the write
    // both fail, and there is nothing to read back.
    process.env['FREECODE_HOME'] = join(base, 'blocked');
    writeFileSync(join(base, 'blocked'), 'not a directory', 'utf-8');

    const claim = claimReviewLock(root, 'first task');
    expect(claim.status).toBe('unavailable');
    if (claim.status !== 'unavailable') return;
    // Not `unreadable-lock`: there is no file to delete, and `checkpoint accept`
    // cannot rescue this either — it would have to write the same store to take
    // its baseline. Telling someone to delete a lock file would misdirect them.
    expect(claim.cause).toBe('store-unwritable');
  });

  describe('recordLockSnapshot', () => {
    it('adds the snapshot id without disturbing the rest of the claim', () => {
      claimReviewLock(root, 'a delegated run');

      recordLockSnapshot(root, { snapshotId: '20260813T000000-7' });

      const held = readReviewLock(root);
      expect(held?.snapshotId).toBe('20260813T000000-7');
      expect(held?.task).toBe('a delegated run');
      expect(held?.pid).toBe(process.pid);
    });

    it('records a failed snapshot as its own state, not a missing id', () => {
      claimReviewLock(root, 'a delegated run');

      recordLockSnapshot(root, { snapshotFailed: true });

      expect(readReviewLock(root)?.snapshotFailed).toBe(true);
      expect(readReviewLock(root)?.snapshotId).toBeUndefined();
    });

    it('never creates a lock — it is an update, not a claim', () => {
      // `claimReviewLock`'s exclusive write is the whole mutual-exclusion
      // mechanism. A bookkeeping call that could conjure a lock out of nothing
      // would let a process that never held one lock the project.
      recordLockSnapshot(root, { snapshotId: '20260813T000000-7' });

      expect(readReviewLock(root)).toBeUndefined();
    });

    it('leaves another process\'s claim alone', () => {
      claimReviewLock(root, 'somebody else');
      const held = readReviewLock(root)!;
      writeFileSync(lockFile(), JSON.stringify({ ...held, pid: process.pid + 1 }), 'utf-8');

      recordLockSnapshot(root, { snapshotId: '20260813T000000-7' });

      expect(readReviewLock(root)?.snapshotId).toBeUndefined();
    });
  });
});

function lockFile(): string {
  return shadowRepoPath(root).path.replace(/\.git$/, '') + '.review-lock';
}
