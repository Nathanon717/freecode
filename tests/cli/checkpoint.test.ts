import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCheckpoint } from '../../src/cli/checkpoint.js';
import { takeSnapshot } from '../../src/snapshots/index.js';
import { claimReviewLock, readReviewLock, recordLockSnapshot } from '../../src/snapshots/review-lock.js';
import { shadowRepoPath } from '../../src/snapshots/shadow-repo.js';

const execFileAsync = promisify(execFile);

let base = '';
let root = '';
let originalHome: string | undefined;
let out: string[] = [];
let err: string[] = [];

async function git(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
    { cwd: root },
  );
  return stdout;
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'freecode-checkpoint-'));
  root = join(base, 'proj');
  await mkdir(root, { recursive: true });
  originalHome = process.env['FREECODE_HOME'];
  process.env['FREECODE_HOME'] = join(base, 'home');

  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...parts) => void out.push(parts.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...parts) => void err.push(parts.join(' ')));
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (originalHome === undefined) delete process.env['FREECODE_HOME'];
  else process.env['FREECODE_HOME'] = originalHome;
  await rm(base, { recursive: true, force: true }).catch(() => {});
});

const stdout = (): string => out.join('\n');
const stderr = (): string => err.join('\n');

describe('freecode checkpoint', () => {
  it('says there is nothing to revert rather than failing', async () => {
    await expect(runCheckpoint({ projectRoot: root, args: ['revert'] })).resolves.toBe(0);
    expect(stdout()).toContain('No snapshots for this project');
  });

  it('reverts to the most recent snapshot with no id', async () => {
    await git('init', '-q', '.');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await git('add', '-A');
    await git('commit', '-qm', 'init');
    await takeSnapshot(root);

    await writeFile(join(root, 'a.txt'), 'damaged\n');
    await writeFile(join(root, 'junk.txt'), 'junk\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['revert'] })).resolves.toBe(0);
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('original\n');
    expect(existsSync(join(root, 'junk.txt'))).toBe(false);
    expect(stdout()).toContain('Reverted');
  });

  it('reverts a named snapshot rather than the newest', async () => {
    await writeFile(join(root, 'a.txt'), 'first\n');
    const first = await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'second\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['revert', first.id] })).resolves.toBe(0);
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('first\n');
  });

  it('names an unknown snapshot instead of reverting the wrong one', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);

    await expect(runCheckpoint({ projectRoot: root, args: ['revert', 'nope'] })).resolves.toBe(1);
    expect(err.join('\n')).toContain('no snapshot nope');
  });

  // The bare word is read-only on purpose: `undo` made the destructive action
  // the default, so a typo restored the project instead of describing it.
  it('lists rather than reverting when no subcommand is given', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await expect(runCheckpoint({ projectRoot: root, args: [] })).resolves.toBe(0);
    expect(stdout()).toContain(snapshot.id);
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('damaged\n');
  });

  it('list shows each snapshot, what changed since it, and how to inspect it by hand', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['list'] })).resolves.toBe(0);
    expect(stdout()).toContain(snapshot.id);
    expect(stdout()).toContain('a.txt');
    expect(stdout()).toContain('--git-dir');
    // Listing must not mutate the project it is describing.
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('damaged\n');
  });

  // The reader is a lead agent holding the change in a context window it is also
  // working in, so the summary is what it gets unless it asks for the patch.
  it('diff summarises by default and prints the raw patch under --patch', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
    // The summary header and the per-file line are the encoding's own; a raw
    // patch carries neither. The hunk itself still appears verbatim below them —
    // one occurrence is not a repeated shape, and nothing is summarised away.
    expect(stdout()).toContain('1 file changed, +1 -1');
    expect(stdout()).toContain('M a.txt');
    expect(stdout()).not.toContain('diff --git');

    out = [];
    await expect(runCheckpoint({ projectRoot: root, args: ['diff', '--patch'] })).resolves.toBe(0);
    expect(stdout()).toContain('diff --git');
    expect(stdout()).toContain('-original');
    expect(stdout()).not.toContain('file changed, +1 -1');
    // Reviewing must not mutate the project it is describing.
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('damaged\n');
  });

  // Finding A3: the reviewer's whole picture of a delegated run is this command,
  // and a `core.hooksPath` pointing at the agent's own script did not appear in it.
  it('shows a config change inside .git, in both diff modes', async () => {
    await git('init', '-q', '.');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await git('add', '-A');
    await git('commit', '-qm', 'init');
    await takeSnapshot(root);
    await git('config', 'core.hooksPath', '.evilhooks');

    for (const args of [['diff'], ['diff', '--patch']]) {
      out = [];
      await expect(runCheckpoint({ projectRoot: root, args })).resolves.toBe(0);
      expect(stdout()).toContain('inside .git');
      // Raw in both modes: a summary of "config changed" is not a review.
      expect(stdout()).toContain('hooksPath = .evilhooks');
    }
  });

  it('flags a .git-only change in the listing too, where the worktree looks clean', async () => {
    await git('init', '-q', '.');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await git('add', '-A');
    await git('commit', '-qm', 'init');
    await takeSnapshot(root);
    await git('config', 'core.hooksPath', '.evilhooks');

    await expect(runCheckpoint({ projectRoot: root, args: ['list'] })).resolves.toBe(0);
    expect(stdout()).not.toContain('(no changes since this snapshot)');
    expect(stdout()).toContain('changes inside .git');
  });

  it('reports a .git-only change rather than calling it no changes at all', async () => {
    await git('init', '-q', '.');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await git('add', '-A');
    await git('commit', '-qm', 'init');
    await takeSnapshot(root);
    // Nothing in the worktree moved — the entire change is inside `.git`, which
    // is exactly the shape that used to report "No changes since snapshot".
    await git('config', 'core.hooksPath', '.evilhooks');

    await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
    expect(stdout()).not.toContain('No changes since snapshot');
    expect(stdout()).toContain('hooksPath');
  });

  // A `.git` that was captured and did not go back leaves the repo in a state that
  // is neither the snapshot nor what the agent produced. Releasing the lock on that
  // would mark it reviewed and let the next delegated run start against it.
  it('keeps the review lock and fails when .git could not be put back', async () => {
    await git('init', '-q', '.');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await git('add', '-A');
    await git('commit', '-qm', 'init');
    const snapshot = await takeSnapshot(root);
    claimReviewLock(root, 'a delegated run');
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    const { path: shadowDir } = shadowRepoPath(root);
    const commit = snapshot.gitDir!;
    await rm(join(shadowDir, 'objects', commit.slice(0, 2), commit.slice(2)), { force: true });

    await expect(runCheckpoint({ projectRoot: root, args: ['revert'] })).resolves.toBe(1);
    // The worktree half still happened, and saying so is the point: the repair is
    // to run the same command again, not to start over.
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('original\n');
    expect(stderr()).toContain('revert` again');
    expect(readReviewLock(root)?.task).toBe('a delegated run');
  });

  // The same rule for the other half. A path that kept the agent's content is a
  // revert that did not finish, whatever git's exit code said about it.
  it.skipIf(process.platform !== 'win32')(
    'keeps the review lock and fails when a file could not be written',
    async () => {
      await writeFile(join(root, 'a.txt'), 'original\n');
      await writeFile(join(root, 'held.db'), 'original\n');
      await takeSnapshot(root);
      claimReviewLock(root, 'a delegated run');
      await writeFile(join(root, 'a.txt'), 'damaged\n');
      await writeFile(join(root, 'held.db'), 'damaged\n');

      const holder = spawn('powershell.exe', [
        '-NoProfile', '-Command',
        `$f=[System.IO.File]::Open('${join(root, 'held.db').replace(/\\/g, '\\\\')}',` +
        `'Open','ReadWrite','Read'); Start-Sleep -Seconds 60; $f.Close()`,
      ], { stdio: 'ignore' });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        await expect(runCheckpoint({ projectRoot: root, args: ['revert'] })).resolves.toBe(1);
        expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('original\n');
        expect(stderr()).toContain('held.db');
        expect(stderr()).toContain('Partly reverted');
        expect(readReviewLock(root)?.task).toBe('a delegated run');
      } finally {
        holder.kill();
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    },
  );

  it('rejects an unknown subcommand by name instead of guessing', async () => {
    await expect(runCheckpoint({ projectRoot: root, args: ['dif'] })).resolves.toBe(1);
    expect(err.join('\n')).toContain('Unknown subcommand: dif');
  });

  it('rejects a flag belonging to another subcommand', async () => {
    await expect(runCheckpoint({ projectRoot: root, args: ['revert', '--patch'] })).resolves.toBe(1);
    expect(err.join('\n')).toContain('--patch applies to');
  });

  it('finds the snapshot when run from a subdirectory of the project', async () => {
    // Someone reaching for a checkpoint is rarely standing where freecode was launched.
    await git('init', '-q', '.');
    await mkdir(join(root, 'src', 'deep'), { recursive: true });
    await writeFile(join(root, 'src', 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'src', 'a.txt'), 'damaged\n');

    const from = join(root, 'src', 'deep');
    await expect(runCheckpoint({ projectRoot: from, args: ['revert'] })).resolves.toBe(0);
    expect(await readFile(join(root, 'src', 'a.txt'), 'utf-8')).toBe('original\n');
    expect(stdout()).toContain('Using snapshots for');
  });

  it('names the directory that does have snapshots instead of reporting none', async () => {
    const inner = join(root, 'inner');
    await mkdir(inner, { recursive: true });
    await writeFile(join(inner, 'a.txt'), 'original\n');
    await takeSnapshot(inner);

    // Standing above the launch directory: walking up would never find it, so
    // "no snapshots" would be a wrong answer to the question being asked.
    await expect(runCheckpoint({ projectRoot: root, args: [] })).resolves.toBe(0);
    expect(stdout()).toContain('Snapshots do exist for:');
    expect(stdout()).toContain(inner);
  });

  // Accept is what turns the net into a review loop: the baseline moves, so the
  // next delegated run's diff is its own work rather than its work plus the last
  // one's.
  it('accept snapshots the current state as the new baseline', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'agent work\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['accept'] })).resolves.toBe(0);
    expect(stdout()).toContain('Accepted');

    out = [];
    await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
    expect(stdout()).toContain('No changes since snapshot');
    // The accepted work is still on disk — accept reviews, it does not restore.
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('agent work\n');
  });

  it('accept works with nothing snapshotted yet', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    await expect(runCheckpoint({ projectRoot: root, args: ['accept'] })).resolves.toBe(0);
    expect(stdout()).toContain('Accepted');
  });

  it('accept and revert each free the project for the next delegated run', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);

    expect(claimReviewLock(root, 'first delegation').status).toBe('claimed');
    const second = claimReviewLock(root, 'second delegation');
    expect(second.status === 'held' && second.held.task).toBe('first delegation');

    await runCheckpoint({ projectRoot: root, args: ['accept'] });
    expect(readReviewLock(root)).toBeUndefined();

    expect(claimReviewLock(root, 'third delegation').status).toBe('claimed');
    await runCheckpoint({ projectRoot: root, args: ['revert'] });
    expect(readReviewLock(root)).toBeUndefined();
  });

  // Only delegated runs are serialised, so an interactive session starting up
  // between a delegation and its review adds a *newer* snapshot. Targeting that
  // one would hide the delegated change and let a revert report success while
  // keeping it.
  it('reviews from where the delegated run began, not the newest snapshot', async () => {
    await writeFile(join(root, 'agent.txt'), 'before\n');
    await writeFile(join(root, 'human.txt'), 'before\n');

    claimReviewLock(root, 'the delegation');
    await takeSnapshot(root);
    await writeFile(join(root, 'agent.txt'), 'delegated edit\n');
    // An interactive session arriving before anyone reviewed: its own snapshot.
    await takeSnapshot(root);
    await writeFile(join(root, 'human.txt'), 'human edit\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
    expect(stdout()).toContain('agent.txt');
    // The later edit is shown too, not hidden — an unexpected one is the signal.
    expect(stdout()).toContain('human.txt');
    expect(stdout()).toContain('since the delegated run began');
  });

  it('reviews the exact snapshot the lock recorded, not the oldest since the claim', async () => {
    // The timestamp walk above cannot separate two snapshots taken in the same
    // window. `-p --edit` writes its own id into the lock on the way out
    // (cli/headless-prompt.ts), so the usual answer is exact rather than inferred.
    await writeFile(join(root, 'agent.txt'), 'before\n');
    await writeFile(join(root, 'human.txt'), 'before\n');
    claimReviewLock(root, 'the delegation');
    // An interactive session that got in first, still inside the claim's window.
    await takeSnapshot(root);
    await writeFile(join(root, 'human.txt'), 'human edit\n');
    const delegated = await takeSnapshot(root);
    recordLockSnapshot(root, { snapshotId: delegated.id });
    await writeFile(join(root, 'agent.txt'), 'delegated edit\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['diff', '--patch'] })).resolves.toBe(0);
    expect(stdout()).toContain('agent.txt');
    // The timestamp walk would have picked the interactive session's snapshot —
    // the oldest since the claim — and dragged its edit into the review.
    expect(stdout()).not.toContain('human.txt');
  });

  it('refuses a bare diff or revert when the delegated run has no snapshot at all', async () => {
    // Finding A5/A6, the half `outstanding()` owns. The run wrote, its snapshot
    // failed, and the only snapshot in the store belongs to somebody else — so a
    // bare revert would restore a state the agent had already damaged, and say it
    // worked. Refusing is the honest answer; naming an id still works.
    await writeFile(join(root, 'agent.txt'), 'damaged by the agent\n');
    claimReviewLock(root, 'the delegation');
    recordLockSnapshot(root, { snapshotFailed: true });
    // A concurrent interactive session's snapshot, taken after the damage.
    await takeSnapshot(root);

    await expect(runCheckpoint({ projectRoot: root, args: ['revert'] })).resolves.toBe(1);
    expect(stderr()).toContain('its checkpoint snapshot failed');
    expect(stderr()).toContain('checkpoint accept');
    await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(1);
    // Still held: nothing was reviewed, so nothing frees the project.
    expect(readReviewLock(root)?.task).toBe('the delegation');
  });

  it('names the lock file when accept cannot take its baseline either', async () => {
    // The escape hatch both R4 messages point at runs through the same store that
    // just failed, so "run `checkpoint accept`" can dead-end. Keeping the lock is
    // right; leaving someone with no last resort is not.
    claimReviewLock(root, 'a delegated run');
    recordLockSnapshot(root, { snapshotFailed: true });
    // A file where the shadow repo belongs, beside the lock file rather than over
    // it: `ensureShadowRepo` cannot mkdir it, and the lock stays readable — which
    // is the shape of the failure, a broken store under an intact claim.
    await writeFile(shadowRepoPath(root).path, 'not a directory\n');

    await expect(runCheckpoint({ projectRoot: root, args: ['accept'] })).resolves.toBe(1);
    expect(stderr()).toContain('.review-lock');
    expect(stderr()).toContain('last resort');
  });

  it('does not report an empty store as nothing having happened', async () => {
    // A delegated run that wrote and could not snapshot leaves no snapshots at
    // all, and this path returns before `outstanding()` is ever consulted — so
    // "freecode takes one before the first write" would read as "nothing to see"
    // about a project the agent has already changed.
    await writeFile(join(root, 'agent.txt'), 'damaged by the agent\n');
    claimReviewLock(root, 'a delegated run');
    recordLockSnapshot(root, { snapshotFailed: true });

    await expect(runCheckpoint({ projectRoot: root, args: ['revert'] })).resolves.toBe(1);
    expect(stderr()).toContain('its checkpoint snapshot failed');
    expect(stdout()).not.toContain('No snapshots for this project');
  });

  it('targets the newest snapshot again once nothing is outstanding', async () => {
    await writeFile(join(root, 'agent.txt'), 'before\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'agent.txt'), 'delegated edit\n');
    await takeSnapshot(root);

    // No lock held: the newest snapshot is the baseline, as it always was.
    await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
    expect(stdout()).toContain('No changes since snapshot');
  });

  // Finding A1: `freecode` is on $PATH and shell_exec is a shell, so the agent
  // under review could run `checkpoint accept` and review itself — lock freed,
  // baseline re-taken so `diff` said "No changes", work still on disk, next
  // delegation permitted. shell_exec stamps FREECODE_SANDBOXED on its children;
  // these are the assertions of docs/scripts/containment-audit/selfapprove.mjs.
  describe('inside an agent shell', () => {
    beforeEach(() => {
      process.env['FREECODE_SANDBOXED'] = '1';
    });
    afterEach(() => {
      process.env['FREECODE_SANDBOXED'] = '';
    });

    it('refuses accept, leaving the lock held and the change visible', async () => {
      await writeFile(join(root, 'a.txt'), 'original\n');
      claimReviewLock(root, 'the delegation');
      await takeSnapshot(root);
      await writeFile(join(root, 'a.txt'), 'agent work\n');

      await expect(runCheckpoint({ projectRoot: root, args: ['accept'] })).resolves.toBe(1);
      expect(stderr()).toContain('FREECODE_SANDBOXED');
      expect(readReviewLock(root)?.task).toBe('the delegation');
      // No baseline was taken, so the reviewer still sees the work.
      await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
      expect(stdout()).toContain('a.txt');
      // And the project is still closed to the next delegated run.
      expect(claimReviewLock(root, 'next task').status).toBe('held');
    });

    // The same hole pointed the other way: revert destroys the evidence the
    // reviewer has not seen yet, plus any concurrent work in the tree.
    it('refuses revert, leaving the tree as it is', async () => {
      await writeFile(join(root, 'a.txt'), 'original\n');
      await takeSnapshot(root);
      await writeFile(join(root, 'a.txt'), 'agent work\n');

      await expect(runCheckpoint({ projectRoot: root, args: ['revert'] })).resolves.toBe(1);
      expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('agent work\n');
    });

    // Reading is not approving. An agent asked to describe its own diff should be
    // able to, and `checkpoint diff` is documented as a read.
    it('still allows list and diff', async () => {
      await writeFile(join(root, 'a.txt'), 'original\n');
      await takeSnapshot(root);
      await writeFile(join(root, 'a.txt'), 'agent work\n');

      await expect(runCheckpoint({ projectRoot: root, args: ['list'] })).resolves.toBe(0);
      await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
      expect(stdout()).toContain('a.txt');
      expect(stderr()).toBe('');
    });
  });

  // Gitignored files are covered now, so the old generic note ("files ignored by
  // .gitignore were left as they are") became false. What a reviewer needs instead
  // is the paths really skipped — an absent node_modules and an untouched one full
  // of payloads are not the same answer.
  it('names the excluded paths a revert left alone', async () => {
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'dep.js'), 'untouched\n');
    await writeFile(join(root, '.gitignore'), 'build/\n');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await runCheckpoint({ projectRoot: root, args: ['revert'] });
    expect(stdout()).toContain('outside snapshot coverage');
    expect(stdout()).toContain('node_modules/');
    expect(stdout()).not.toContain('ignored by .gitignore');
  });

  it('says nothing about exclusions when the project has none', async () => {
    await writeFile(join(root, '.gitignore'), 'build/\n');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await runCheckpoint({ projectRoot: root, args: ['revert'] });
    expect(stdout()).toContain('Reverted');
    expect(stdout()).not.toContain('outside snapshot coverage');
  });
});
