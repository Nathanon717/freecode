import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCheckpoint } from '../../src/cli/checkpoint.js';
import { takeSnapshot } from '../../src/snapshots/index.js';
import { claimReviewLock, readReviewLock } from '../../src/snapshots/review-lock.js';

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

    expect(claimReviewLock(root, 'first delegation')).toBeUndefined();
    expect(claimReviewLock(root, 'second delegation')?.task).toBe('first delegation');

    await runCheckpoint({ projectRoot: root, args: ['accept'] });
    expect(readReviewLock(root)).toBeUndefined();

    expect(claimReviewLock(root, 'third delegation')).toBeUndefined();
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

  it('targets the newest snapshot again once nothing is outstanding', async () => {
    await writeFile(join(root, 'agent.txt'), 'before\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'agent.txt'), 'delegated edit\n');
    await takeSnapshot(root);

    // No lock held: the newest snapshot is the baseline, as it always was.
    await expect(runCheckpoint({ projectRoot: root, args: ['diff'] })).resolves.toBe(0);
    expect(stdout()).toContain('No changes since snapshot');
  });

  it('states that gitignored files were left alone', async () => {
    await writeFile(join(root, '.gitignore'), 'build/\n');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await runCheckpoint({ projectRoot: root, args: ['revert'] });
    expect(stdout()).toContain('.gitignore');
  });
});
