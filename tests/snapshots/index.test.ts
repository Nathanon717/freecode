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
    expect(outcome.indexRestored).toBe(true);
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

  it('excludes gitignored files, which is what keeps snapshots cheap', async () => {
    await writeFile(join(root, '.gitignore'), 'ignored/\n');
    await mkdir(join(root, 'ignored'), { recursive: true });
    await writeFile(join(root, 'ignored', 'big.bin'), 'not backed up\n');
    await commitAll(root, 'ignore');

    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'ignored', 'big.bin'), 'changed by agent\n');
    await restoreSnapshot(root, snapshot.id);

    // Out of scope for recovery, and documented as such.
    expect(await readFile(join(root, 'ignored', 'big.bin'), 'utf-8')).toBe('changed by agent\n');
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
    expect(outcome.indexRestored).toBe(false);
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

  it('says plainly that history was not recovered when .git is gone', async () => {
    await git(root, 'init', '-q', '.');
    await writeFile(join(root, 'tracked.txt'), 'original\n');
    await commitAll(root, 'init');
    const snapshot = await takeSnapshot(root);

    await rm(join(root, '.git'), { recursive: true, force: true });
    await writeFile(join(root, 'tracked.txt'), 'damaged\n');
    const outcome = await restoreSnapshot(root, snapshot.id);

    expect(await readFile(join(root, 'tracked.txt'), 'utf-8')).toBe('original\n');
    expect(outcome.indexRestored).toBe(false);
    expect(outcome.warnings.join(' ')).toContain('NOT recovered');
  });
});
