import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  claimReviewLock,
  readReviewLock,
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
    expect(claimReviewLock(root, 'first task')).toBeUndefined();

    const held = claimReviewLock(root, 'second task');
    expect(held?.task).toBe('first task');
    expect(held?.pid).toBe(process.pid);
    expect(held?.startedAt).not.toBe('');
  });

  it('frees the project again on release', () => {
    claimReviewLock(root, 'first task');
    releaseReviewLock(root);

    expect(readReviewLock(root)).toBeUndefined();
    expect(claimReviewLock(root, 'second task')).toBeUndefined();
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

  // A half-written or hand-edited lock file must not be able to wedge the
  // project: it reads as no lock, and the next run claims over it.
  it('treats an unreadable lock as absent', () => {
    claimReviewLock(root, 'first task');
    const { path: shadowDir } = shadowRepoPath(root);
    writeFileSync(shadowDir.replace(/\.git$/, '') + '.review-lock', 'not json', 'utf-8');

    expect(readReviewLock(root)).toBeUndefined();
  });
});
