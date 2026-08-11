import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runUndo } from '../../src/cli/undo.js';
import { takeSnapshot } from '../../src/snapshots/index.js';

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
  base = await mkdtemp(join(tmpdir(), 'freecode-undo-'));
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

describe('freecode undo', () => {
  it('says there is nothing to undo rather than failing', async () => {
    await expect(runUndo({ projectRoot: root, args: [] })).resolves.toBe(0);
    expect(stdout()).toContain('No snapshots for this project');
  });

  it('restores the most recent snapshot with no arguments', async () => {
    await git('init', '-q', '.');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await git('add', '-A');
    await git('commit', '-qm', 'init');
    await takeSnapshot(root);

    await writeFile(join(root, 'a.txt'), 'damaged\n');
    await writeFile(join(root, 'junk.txt'), 'junk\n');

    await expect(runUndo({ projectRoot: root, args: [] })).resolves.toBe(0);
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('original\n');
    expect(existsSync(join(root, 'junk.txt'))).toBe(false);
    expect(stdout()).toContain('Restored');
  });

  it('restores a named snapshot rather than the newest', async () => {
    await writeFile(join(root, 'a.txt'), 'first\n');
    const first = await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'second\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await expect(runUndo({ projectRoot: root, args: [first.id] })).resolves.toBe(0);
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('first\n');
  });

  it('names an unknown snapshot instead of restoring the wrong one', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);

    await expect(runUndo({ projectRoot: root, args: ['nope'] })).resolves.toBe(1);
    expect(err.join('\n')).toContain('no snapshot nope');
  });

  it('--list shows each snapshot, what changed since it, and how to inspect it by hand', async () => {
    await writeFile(join(root, 'a.txt'), 'original\n');
    const snapshot = await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await expect(runUndo({ projectRoot: root, args: ['--list'] })).resolves.toBe(0);
    expect(stdout()).toContain(snapshot.id);
    expect(stdout()).toContain('a.txt');
    expect(stdout()).toContain('--git-dir');
    // Listing must not mutate the project it is describing.
    expect(await readFile(join(root, 'a.txt'), 'utf-8')).toBe('damaged\n');
  });

  it('finds the snapshot when run from a subdirectory of the project', async () => {
    // Someone reaching for undo is rarely standing where freecode was launched.
    await git('init', '-q', '.');
    await mkdir(join(root, 'src', 'deep'), { recursive: true });
    await writeFile(join(root, 'src', 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'src', 'a.txt'), 'damaged\n');

    await expect(runUndo({ projectRoot: join(root, 'src', 'deep'), args: [] })).resolves.toBe(0);
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
    await expect(runUndo({ projectRoot: root, args: [] })).resolves.toBe(0);
    expect(stdout()).toContain('Snapshots do exist for:');
    expect(stdout()).toContain(inner);
  });

  it('states that gitignored files were left alone', async () => {
    await writeFile(join(root, '.gitignore'), 'build/\n');
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);
    await writeFile(join(root, 'a.txt'), 'damaged\n');

    await runUndo({ projectRoot: root, args: [] });
    expect(stdout()).toContain('.gitignore');
  });
});
