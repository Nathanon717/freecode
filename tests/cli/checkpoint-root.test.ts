import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { isUnder, resolveSnapshotRoot } from '../../src/cli/checkpoint-root.js';
import { takeSnapshot } from '../../src/snapshots/index.js';

const execFileAsync = promisify(execFile);

let base = '';
let root = '';
let originalHome: string | undefined;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'freecode-checkpoint-root-'));
  root = join(base, 'proj');
  await mkdir(root, { recursive: true });
  originalHome = process.env['FREECODE_HOME'];
  process.env['FREECODE_HOME'] = join(base, 'home');
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env['FREECODE_HOME'];
  else process.env['FREECODE_HOME'] = originalHome;
  await rm(base, { recursive: true, force: true }).catch(() => {});
});

describe('resolveSnapshotRoot', () => {
  it('preserves the launch path spelling while walking to the repository root', async () => {
    await execFileAsync('git', ['init', '-q', '.'], { cwd: root });
    await writeFile(join(root, 'a.txt'), 'original\n');
    await takeSnapshot(root);
    const deep = join(root, 'src', 'deep');
    await mkdir(deep, { recursive: true });

    expect(await resolveSnapshotRoot(deep)).toBe(root);
  });
});

describe('isUnder', () => {
  it('accepts descendants but not the directory itself or a sibling', () => {
    expect(isUnder(root, join(root, 'src'))).toBe(true);
    expect(isUnder(root, root)).toBe(false);
    expect(isUnder(root, join(base, 'sibling'))).toBe(false);
  });
});
