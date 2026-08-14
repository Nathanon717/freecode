import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { lockedFilesWarning, restoreWorktree } from '../../src/snapshots/locked-files.js';
import { takeSnapshot } from '../../src/snapshots/index.js';
import { shadowRepoPath } from '../../src/snapshots/shadow-repo.js';

const execFileAsync = promisify(execFile);

let root = '';
let home = '';
let originalHome: string | undefined;
let holder: ChildProcess | undefined;

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), 'freecode-locked-'));
  root = join(base, 'proj');
  home = join(base, 'home');
  await mkdir(root, { recursive: true });
  await mkdir(home, { recursive: true });
  originalHome = process.env['FREECODE_HOME'];
  process.env['FREECODE_HOME'] = home;
});

afterEach(async () => {
  holder?.kill();
  holder = undefined;
  if (originalHome === undefined) delete process.env['FREECODE_HOME'];
  else process.env['FREECODE_HOME'] = originalHome;
  // The holder needs a moment to actually let go before the tree can be removed.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await rm(join(root, '..'), { recursive: true, force: true }).catch(() => {});
});

/**
 * Holds `file` the way SQLite holds a database on Windows: readable, so `git add`
 * still stages it, but neither replaceable nor deletable — which is the whole
 * point, since a file git cannot even *read* fails at staging and never reaches
 * the restore this module is about.
 *
 * Windows-only, and the tests using it say so rather than pretend otherwise. There
 * is no portable way to take this lock: POSIX advisory locks do not stop `unlink`,
 * and the read-only-parent-directory trick that would is a different failure with
 * different wording from git. The behaviour under test is a Windows one.
 */
async function holdOpen(file: string): Promise<void> {
  holder = spawn('powershell.exe', [
    '-NoProfile', '-Command',
    `$f=[System.IO.File]::Open('${file.replace(/\\/g, '\\\\')}','Open','ReadWrite','Read'); ` +
    "Write-Output 'ready'; Start-Sleep -Seconds 60; $f.Close()",
  ], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for file holder')), 10_000);
    holder!.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    holder!.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`File holder exited before acquiring the lock (${code ?? 'signal'})`));
    });
    holder!.stdout!.once('data', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

const onWindows = process.platform === 'win32';

describe('restoreWorktree', () => {
  it('restores the tree and reports nothing when no file is held', async () => {
    await writeFile(join(root, 'kept.txt'), 'original\n');
    const meta = await takeSnapshot(root);
    await writeFile(join(root, 'kept.txt'), 'agent\n');
    await writeFile(join(root, 'payload.js'), 'evil\n');

    const locked = await restoreWorktree(
      shadowRepoPath(root).path,
      root,
      `refs/snapshots/${meta.id}`,
    );

    expect(locked).toEqual([]);
    expect(await readFile(join(root, 'kept.txt'), 'utf-8')).toBe('original\n');
    expect(existsSync(join(root, 'payload.js'))).toBe(false);
  });

  it('rethrows a failure that is not a file it could not unlink', async () => {
    await writeFile(join(root, 'kept.txt'), 'original\n');
    await takeSnapshot(root);

    // Nothing was restored here, so swallowing this would report a revert that
    // never happened. Only the measured unlink shape is safe to tolerate.
    await expect(
      restoreWorktree(shadowRepoPath(root).path, root, 'refs/snapshots/no-such-snapshot'),
    ).rejects.toThrow();
  });

  it.skipIf(!onWindows)(
    'restores everything else and names a file another process is replacing-locked',
    async () => {
      await writeFile(join(root, 'aaa.txt'), 'original\n');
      await writeFile(join(root, 'held.db'), 'original\n');
      await writeFile(join(root, 'zzz.txt'), 'original\n');
      const meta = await takeSnapshot(root);
      await writeFile(join(root, 'aaa.txt'), 'agent\n');
      await writeFile(join(root, 'held.db'), 'agent\n');
      await writeFile(join(root, 'zzz.txt'), 'agent\n');
      await holdOpen(join(root, 'held.db'));

      const locked = await restoreWorktree(
        shadowRepoPath(root).path,
        root,
        `refs/snapshots/${meta.id}`,
      );

      expect(locked).toEqual(['held.db']);
      // The claim the whole module rests on: git does not stop at the first
      // failure, including for paths sorting after it.
      expect(await readFile(join(root, 'aaa.txt'), 'utf-8')).toBe('original\n');
      expect(await readFile(join(root, 'zzz.txt'), 'utf-8')).toBe('original\n');
      expect(await readFile(join(root, 'held.db'), 'utf-8')).toBe('agent\n');
    },
  );

  it.skipIf(!onWindows)(
    'names a file it could not delete, which git reports as a warning and exit 0',
    async () => {
      // The quiet half, and the dangerous one: agent-created content surviving a
      // revert while git reports success. `runGit` drops stderr on exit 0, so
      // without reading it back this is completely silent.
      await writeFile(join(root, 'kept.txt'), 'original\n');
      const meta = await takeSnapshot(root);
      await writeFile(join(root, 'kept.txt'), 'agent\n');
      await writeFile(join(root, 'payload.db'), 'evil\n');
      await holdOpen(join(root, 'payload.db'));

      const locked = await restoreWorktree(
        shadowRepoPath(root).path,
        root,
        `refs/snapshots/${meta.id}`,
      );

      expect(locked).toEqual(['payload.db']);
      expect(await readFile(join(root, 'kept.txt'), 'utf-8')).toBe('original\n');
      expect(existsSync(join(root, 'payload.db'))).toBe(true);
    },
  );

  it.skipIf(!onWindows)('finishes the job when the same restore is run again', async () => {
    await writeFile(join(root, 'held.db'), 'original\n');
    const meta = await takeSnapshot(root);
    await writeFile(join(root, 'held.db'), 'agent\n');
    await holdOpen(join(root, 'held.db'));
    const shadowDir = shadowRepoPath(root).path;

    expect(await restoreWorktree(shadowDir, root, `refs/snapshots/${meta.id}`)).toEqual(['held.db']);
    holder?.kill();
    holder = undefined;
    await new Promise((resolve) => setTimeout(resolve, 500));

    // The advice the warning gives has to be true: `read-tree -u --reset` is
    // idempotent, so repeating the revert once the holder lets go completes it.
    expect(await restoreWorktree(shadowDir, root, `refs/snapshots/${meta.id}`)).toEqual([]);
    expect(await readFile(join(root, 'held.db'), 'utf-8')).toBe('original\n');
  });
});

describe('lockedFilesWarning', () => {
  it('names every path and both ways out of the situation', () => {
    const warning = lockedFilesWarning(['data/dev.db', 'logs/app.log']);

    expect(warning).toContain('data/dev.db');
    expect(warning).toContain('logs/app.log');
    // Re-running finishes a transient holder; accept is the end for a dev server
    // that will hold its database for as long as it runs.
    expect(warning).toContain('checkpoint revert');
    expect(warning).toContain('checkpoint accept');
  });
});

// Guards the one assumption `restoreWorktree` cannot make for itself: that git
// still spells these failures the way the parse expects.
describe('git stderr contract', () => {
  it.skipIf(!onWindows)('reports a replace it cannot do as `unable to unlink old`', async () => {
    await writeFile(join(root, 'held.db'), 'original\n');
    await execFileAsync('git', ['init', '-q', '.'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'b'], { cwd: root });
    await writeFile(join(root, 'held.db'), 'agent\n');
    await holdOpen(join(root, 'held.db'));

    const stderr = await execFileAsync('git', ['read-tree', '-u', '--reset', 'HEAD'], { cwd: root })
      .then(() => '')
      .catch((error: { stderr?: string }) => error.stderr ?? '');

    expect(stderr).toMatch(/error: unable to unlink old 'held\.db':/);
  });
});
