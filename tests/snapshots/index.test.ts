import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  listSnapshots,
  pruneSnapshots,
  restoreSnapshot,
  snapshotDiffStat,
  snapshotGitDirDiff,
  takeSnapshot,
  inspectHint,
} from '../../src/snapshots/index.js';
import { shadowRepoPath } from '../../src/snapshots/shadow-repo.js';

const execFileAsync = promisify(execFile);

const GIT_IDENTITY = ['-c', 'user.email=t@t', '-c', 'user.name=t'];

let root = '';
let home = '';
let originalHome: string | undefined;

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', [...GIT_IDENTITY, ...args], { cwd });
  return stdout;
}

async function commitAll(cwd: string, message: string): Promise<void> {
  await git(cwd, 'add', '-A');
  await git(cwd, 'commit', '-qm', message);
}

function md5(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), 'freecode-snap-'));
  root = join(base, 'proj');
  home = join(base, 'home');
  await mkdir(root, { recursive: true });
  await mkdir(home, { recursive: true });
  originalHome = process.env['FREECODE_HOME'];
  process.env['FREECODE_HOME'] = home;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env['FREECODE_HOME'];
  else process.env['FREECODE_HOME'] = originalHome;
  await rm(join(root, '..'), { recursive: true, force: true }).catch(() => {});
});

describe('snapshots over a git project', () => {
  beforeEach(async () => {
    await git(root, 'init', '-q', '.');
    await writeFile(join(root, 'tracked.txt'), 'original\n');
    await commitAll(root, 'init');
    await writeFile(join(root, 'untracked.txt'), 'untracked\n');
  });

  it('restores tracked edits, untracked files, and agent-created junk in one pass', async () => {
    const before = await git(root, 'status', '--porcelain');
    const head = (await git(root, 'rev-parse', 'HEAD')).trim();
    const snapshot = await takeSnapshot(root);

    // The disaster: a tracked file overwritten, an untracked file deleted, junk
    // added, and the lot committed.
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    await rm(join(root, 'untracked.txt'));
    await writeFile(join(root, 'junk.txt'), 'junk\n');
    await commitAll(root, 'rogue');

    const outcome = await restoreSnapshot(root, snapshot.id);

    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('original\n');
    expect(await readFile(join(root, 'untracked.txt'), 'utf-8')).toBe('untracked\n');
    expect(existsSync(join(root, 'junk.txt'))).toBe(false);
    expect(await git(root, 'status', '--porcelain')).toBe(before);
    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head);
    expect(outcome.gitDirRestored).toBe(true);
    expect(outcome.headRestored).toBe(true);
    expect(outcome.warnings).toEqual([]);
  });

  it('restores the staged/unstaged split, not just the file contents', async () => {
    await writeFile(join(root, 'tracked.txt'), 'staged\n');
    await git(root, 'add', 'tracked.txt');
    await writeFile(join(root, 'tracked.txt'), 'staged then modified\n');
    const before = await git(root, 'status', '--porcelain');
    expect(before).toContain('MM tracked.txt');

    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    await git(root, 'add', '-A');

    await restoreSnapshot(root, snapshot.id);
    expect(await git(root, 'status', '--porcelain')).toBe(before);
  });

  it('leaves history alone when the agent never moved HEAD', async () => {
    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');

    const outcome = await restoreSnapshot(root, snapshot.id);
    expect(outcome.headRestored).toBe(false);
    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('original\n');
  });

  it('brings HEAD back off a branch the agent created, not just the branch ref', async () => {
    // The honest-agent case: `git checkout -b` is ordinary work, and moving the
    // old branch ref underneath the user restored nothing they could see —
    // revert reported success while leaving them on the agent's branch.
    const branch = (await git(root, 'symbolic-ref', '--short', 'HEAD')).trim();
    const head = (await git(root, 'rev-parse', 'HEAD')).trim();
    const snapshot = await takeSnapshot(root);

    await git(root, 'checkout', '-q', '-b', 'agent-work');
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    await commitAll(root, 'rogue');

    const outcome = await restoreSnapshot(root, snapshot.id);

    expect((await git(root, 'symbolic-ref', '--short', 'HEAD')).trim()).toBe(branch);
    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head);
    expect(outcome.headRestored).toBe(true);
  });

  it('reattaches a HEAD the agent detached', async () => {
    const branch = (await git(root, 'symbolic-ref', '--short', 'HEAD')).trim();
    const snapshot = await takeSnapshot(root);

    await git(root, 'checkout', '-q', '--detach');
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    await commitAll(root, 'rogue');

    const outcome = await restoreSnapshot(root, snapshot.id);

    expect((await git(root, 'symbolic-ref', '--short', 'HEAD')).trim()).toBe(branch);
    expect(outcome.headRestored).toBe(true);
  });

  it('leaves HEAD detached when that is where the snapshot found it', async () => {
    // `projectHead` records a detached HEAD as no branch at all, so this is the
    // arm that writes HEAD directly with `--no-deref`. Without a test the only
    // coverage was the branch arm, which would silently have been enough for
    // `update-ref refs/heads/HEAD` to look correct.
    await git(root, 'checkout', '-q', '--detach');
    const head = (await git(root, 'rev-parse', 'HEAD')).trim();
    const snapshot = await takeSnapshot(root);
    expect(snapshot.branch).toBeUndefined();

    await git(root, 'checkout', '-q', '-b', 'agent-work');
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    await commitAll(root, 'rogue');

    const outcome = await restoreSnapshot(root, snapshot.id);

    await expect(git(root, 'symbolic-ref', '--quiet', 'HEAD')).rejects.toThrow();
    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head);
    expect(outcome.headRestored).toBe(true);
  });

  // Finding A2. A payload under `dist/` needed no `.gitignore` edit to be both
  // invisible to `checkpoint diff` and immune to `checkpoint revert`, and deleting
  // an ignored `.env` was unrecoverable. Diff and restore are asserted together on
  // purpose: they stage through one shared builder, and the failure mode if they
  // ever diverge is a revert that leaves behind exactly what the diff showed.
  it('covers gitignored files in both directions', async () => {
    await writeFile(join(root, '.gitignore'), 'dist/\n.env\n');
    await mkdir(join(root, 'dist'), { recursive: true });
    await writeFile(join(root, 'dist', 'app.js'), 'legitimate build\n');
    await writeFile(join(root, '.env'), 'SECRET=1\n');
    await commitAll(root, 'ignore');

    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'dist', 'payload.js'), 'exfiltrate();\n');
    await writeFile(join(root, 'dist', 'app.js'), 'tampered build\n');
    await rm(join(root, '.env'));

    const stat = await snapshotDiffStat(root, snapshot.id);
    expect(stat).toContain('dist/payload.js');
    expect(stat).toContain('.env');

    await restoreSnapshot(root, snapshot.id);

    expect(existsSync(join(root, 'dist', 'payload.js'))).toBe(false);
    expect(await readFile(join(root, 'dist', 'app.js'), 'utf-8')).toBe('legitimate build\n');
    expect(await readFile(join(root, '.env'), 'utf-8')).toBe('SECRET=1\n');
  });

  // The one exclusion, and it is prevention rather than backup: containment mounts
  // node_modules read-only (C3), so there is nothing to hide there and 316 MB not
  // worth copying. A revert must leave it alone rather than half-restore it.
  it('leaves node_modules out of the snapshot at any depth', async () => {
    await mkdir(join(root, 'node_modules', '.bin'), { recursive: true });
    await mkdir(join(root, 'packages', 'app', 'node_modules'), { recursive: true });
    await writeFile(join(root, 'node_modules', '.bin', 'tsc'), 'original\n');
    await writeFile(join(root, 'packages', 'app', 'node_modules', 'dep.js'), 'original\n');

    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'node_modules', '.bin', 'tsc'), 'payload\n');
    await writeFile(join(root, 'packages', 'app', 'node_modules', 'dep.js'), 'payload\n');
    // A covered file changed in the same breath, so an empty diff cannot pass this
    // by capturing nothing at all — the stat has to name this and only this.
    await writeFile(join(root, 'tracked.txt'), 'covered change\n');

    const stat = await snapshotDiffStat(root, snapshot.id);
    expect(stat).toContain('tracked.txt');
    expect(stat).not.toContain('node_modules');
    await restoreSnapshot(root, snapshot.id);

    expect(await readFile(join(root, 'node_modules', '.bin', 'tsc'), 'utf-8')).toBe('payload\n');
    expect(await readFile(join(root, 'packages', 'app', 'node_modules', 'dep.js'), 'utf-8')).toBe('payload\n');
  });

  it('honours FREECODE_SNAPSHOT_EXCLUDE over the default list', async () => {
    process.env['FREECODE_SNAPSHOT_EXCLUDE'] = 'cache';
    try {
      await mkdir(join(root, 'cache'), { recursive: true });
      await mkdir(join(root, 'node_modules'), { recursive: true });
      await writeFile(join(root, 'cache', 'blob'), 'original\n');
      await writeFile(join(root, 'node_modules', 'dep.js'), 'original\n');

      const snapshot = await takeSnapshot(root);
      await writeFile(join(root, 'cache', 'blob'), 'changed\n');
      await writeFile(join(root, 'node_modules', 'dep.js'), 'changed\n');
      await restoreSnapshot(root, snapshot.id);

      // The override replaces the default rather than adding to it.
      expect(await readFile(join(root, 'cache', 'blob'), 'utf-8')).toBe('changed\n');
      expect(await readFile(join(root, 'node_modules', 'dep.js'), 'utf-8')).toBe('original\n');
    } finally {
      delete process.env['FREECODE_SNAPSHOT_EXCLUDE'];
    }
  });


  it('reports what changed since a snapshot', async () => {
    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');

    expect(await snapshotDiffStat(root, snapshot.id)).toContain('tracked.txt');
  });

  it('lists snapshots newest first and prunes to the newest N', async () => {
    const first = await takeSnapshot(root);
    const second = await takeSnapshot(root);
    expect(second.id).not.toBe(first.id);

    const listed = await listSnapshots(root);
    expect(listed.map((s) => s.id)).toEqual([second.id, first.id]);
    expect(listed[0].branch).toBeTruthy();
    expect(listed[0].head).toBeTruthy();

    expect(await pruneSnapshots(root, 1)).toBe(1);
    expect((await listSnapshots(root)).map((s) => s.id)).toEqual([second.id]);
  });

  it('lets concurrent sessions snapshot the same project without colliding', async () => {
    // CLAUDE.md makes this the normal case: an interactive session delegating to
    // `freecode -p --edit` has two processes in one project. Sharing the shadow
    // repo's index would collide on index.lock, and the hook swallows failures —
    // so the second session would run unprotected and silently.
    const results = await Promise.all([
      takeSnapshot(root),
      takeSnapshot(root),
      takeSnapshot(root),
    ]);

    const ids = new Set(results.map((s) => s.id));
    expect(ids.size).toBe(3);
    expect((await listSnapshots(root)).map((s) => s.id).sort()).toEqual([...ids].sort());
  });

  it('names a missing snapshot rather than restoring the wrong one', async () => {
    await takeSnapshot(root);
    await expect(restoreSnapshot(root, 'nope')).rejects.toThrow('No snapshot nope');
  });

  it('never creates a shadow repo as a side effect of reading', async () => {
    const untouched = join(root, 'sub');
    await mkdir(untouched, { recursive: true });

    expect(await listSnapshots(untouched)).toEqual([]);
    await expect(restoreSnapshot(untouched, 'nope')).rejects.toThrow('No snapshot nope');
    await expect(snapshotDiffStat(untouched, 'nope')).rejects.toThrow();

    expect(existsSync(join(shadowRepoPath(untouched).path, 'HEAD'))).toBe(false);
  });

  it('prints an incantation that actually reaches the shadow repo', async () => {
    await takeSnapshot(root);
    expect(inspectHint(root)).toContain('--git-dir');
    expect(inspectHint(root)).toContain(home);
  });
});

describe('snapshots and line endings', () => {
  // The regression most likely to be reintroduced by a well-meaning
  // simplification: without `* -text` in the shadow repo's own info/attributes,
  // restore re-applies the user's smudge filters and silently rewrites line
  // endings on the way back out.
  it('round-trips LF and CRLF files byte-identically under core.autocrlf=true', async () => {
    await git(root, 'init', '-q', '.');
    await git(root, 'config', 'core.autocrlf', 'true');
    await writeFile(join(root, '.gitattributes'), '* text=auto\n');
    await writeFile(join(root, 'lf.txt'), 'one\ntwo\nthree\n');
    await writeFile(join(root, 'crlf.txt'), 'one\r\ntwo\r\nthree\r\n');
    await commitAll(root, 'init');

    const lfBefore = md5(await readFile(join(root, 'lf.txt')));
    const crlfBefore = md5(await readFile(join(root, 'crlf.txt')));

    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'lf.txt'), 'damaged\n');
    await writeFile(join(root, 'crlf.txt'), 'damaged\r\n');
    await restoreSnapshot(root, snapshot.id);

    expect(md5(await readFile(join(root, 'lf.txt')))).toBe(lfBefore);
    expect(md5(await readFile(join(root, 'crlf.txt')))).toBe(crlfBefore);
  });
});

// Finding A3. `git config core.hooksPath` was RCE that survived a revert and never
// appeared in a diff: `.git` was outside coverage entirely, so config, refs, and
// the reflog were whatever the agent left. These assert the directory itself is
// snapshot state now.
describe('snapshots over the project .git', () => {
  beforeEach(async () => {
    await git(root, 'init', '-q', '.');
    await writeFile(join(root, 'tracked.txt'), 'original\n');
    await commitAll(root, 'init');
  });

  it('reverts a planted core.hooksPath and shows it in the diff first', async () => {
    const snapshot = await takeSnapshot(root);

    // The payload: a hook directory git will run on the user's next commit. The
    // script itself is an ordinary worktree file; `core.hooksPath` is the half
    // that used to be unreachable.
    await mkdir(join(root, '.evilhooks'), { recursive: true });
    await writeFile(join(root, '.evilhooks', 'pre-commit'), '#!/bin/sh\ntouch HOOK_RAN\n');
    await git(root, 'config', 'core.hooksPath', '.evilhooks');

    const gitPatch = await snapshotGitDirDiff(root, snapshot);
    expect(gitPatch).toContain('hooksPath');

    await restoreSnapshot(root, snapshot.id);

    await expect(git(root, 'config', 'core.hooksPath')).rejects.toThrow();
    expect(existsSync(join(root, '.evilhooks', 'pre-commit'))).toBe(false);
    expect(await snapshotGitDirDiff(root, snapshot)).toBe('');
  });

  it('recovers a branch the agent deleted', async () => {
    await git(root, 'branch', 'sidebranch');
    const side = (await git(root, 'rev-parse', 'sidebranch')).trim();
    const snapshot = await takeSnapshot(root);

    await git(root, 'branch', '-D', 'sidebranch');
    // The teeth of the finding: with the refs gone, this collects the objects
    // they held, so nothing short of snapshotting `.git` could bring it back.
    await git(root, 'reflog', 'expire', '--all', '--expire=now');
    await git(root, 'gc', '-q', '--prune=now');

    await restoreSnapshot(root, snapshot.id);

    expect((await git(root, 'rev-parse', 'sidebranch')).trim()).toBe(side);
    expect(await git(root, 'fsck', '--no-progress')).toBe('');
  });

  it('never captures a transient index.lock, which a revert would recreate', async () => {
    // Restoring one would wedge every later git command in the project with
    // "Another git process seems to be running".
    await writeFile(join(root, '.git', 'index.lock'), '');
    const snapshot = await takeSnapshot(root);
    await rm(join(root, '.git', 'index.lock'));

    await restoreSnapshot(root, snapshot.id);
    expect(existsSync(join(root, '.git', 'index.lock'))).toBe(false);
  });

  it('keeps the worktree restore and says how to finish the job when .git cannot be put back', async () => {
    // The real trigger is a file another process holds open — `.git/index` under
    // an editor aborts `read-tree -u` mid-write on Windows. Deleting the object
    // the restore reads reproduces that failure without an OS-specific lock.
    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    const { path: shadowDir } = shadowRepoPath(root);
    const commit = snapshot.gitDir!;
    await rm(join(shadowDir, 'objects', commit.slice(0, 2), commit.slice(2)), { force: true });

    const outcome = await restoreSnapshot(root, snapshot.id);

    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('original\n');
    expect(outcome.gitDirRestored).toBe(false);
    expect(outcome.warnings.join(' ')).toContain('revert` again');
  });
});

describe('snapshots outside a git project', () => {
  it('restores the worktree of a plain directory', async () => {
    await writeFile(join(root, 'notes.txt'), 'original\n');
    const snapshot = await takeSnapshot(root);
    expect(snapshot.head).toBeUndefined();
    expect(snapshot.branch).toBeUndefined();

    await writeFile(join(root, 'notes.txt'), 'damaged\n');
    await writeFile(join(root, 'junk.txt'), 'junk\n');
    const outcome = await restoreSnapshot(root, snapshot.id);

    expect(await readFile(join(root, 'notes.txt'), 'utf-8')).toBe('original\n');
    expect(existsSync(join(root, 'junk.txt'))).toBe(false);
    expect(outcome.gitDirRestored).toBe(false);
    expect(outcome.warnings).toEqual([]);
  });

  it('never writes an index into a repo the snapshot predates', async () => {
    await writeFile(join(root, 'notes.txt'), 'original\n');
    const snapshot = await takeSnapshot(root);

    // `git init` after the snapshot: that index belongs to history the snapshot
    // knows nothing about, so restore must leave it alone.
    await git(root, 'init', '-q', '.');
    await writeFile(join(root, 'later.txt'), 'later\n');
    await git(root, 'add', 'later.txt');
    const indexBefore = md5(await readFile(join(root, '.git', 'index')));

    await restoreSnapshot(root, snapshot.id);
    expect(md5(await readFile(join(root, '.git', 'index')))).toBe(indexBefore);
  });

  // This used to be the test that a revert said plainly that history was gone for
  // good. `.git` is snapshotted now, so the honest answer changed: it comes back.
  it('rebuilds a .git the agent deleted outright', async () => {
    await git(root, 'init', '-q', '.');
    await writeFile(join(root, 'tracked.txt'), 'original\n');
    await commitAll(root, 'init');
    const head = (await git(root, 'rev-parse', 'HEAD')).trim();
    const snapshot = await takeSnapshot(root);

    await rm(join(root, '.git'), { recursive: true, force: true });
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    const outcome = await restoreSnapshot(root, snapshot.id);

    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('original\n');
    expect(outcome.gitDirRestored).toBe(true);
    expect(outcome.warnings).toEqual([]);
    expect((await git(root, 'rev-parse', 'HEAD')).trim()).toBe(head);
    expect(await git(root, 'status', '--porcelain')).toBe('');
  });
});
