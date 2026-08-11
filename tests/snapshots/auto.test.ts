import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureSnapshot, resetSnapshotMemo } from '../../src/snapshots/auto.js';
import { listSnapshots } from '../../src/snapshots/index.js';
import { setProjectRoot } from '../../src/agent/workspace.js';

let base = '';
let root = '';
let originalHome: string | undefined;
const originalRoot = process.cwd();

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'freecode-auto-'));
  root = join(base, 'proj');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'a.txt'), 'original\n');
  originalHome = process.env['FREECODE_HOME'];
  process.env['FREECODE_HOME'] = join(base, 'home');
  setProjectRoot(root);
  resetSnapshotMemo();
});

afterEach(async () => {
  setProjectRoot(originalRoot);
  resetSnapshotMemo();
  if (originalHome === undefined) delete process.env['FREECODE_HOME'];
  else process.env['FREECODE_HOME'] = originalHome;
  await rm(base, { recursive: true, force: true }).catch(() => {});
});

describe('ensureSnapshot', () => {
  it('snapshots once no matter how many write calls arrive', async () => {
    await ensureSnapshot();
    // A second snapshot would capture post-mutation state — the exact thing the
    // process-scoped memo exists to prevent.
    await writeFile(join(root, 'a.txt'), 'mutated by the agent\n');
    await ensureSnapshot();

    expect(await listSnapshots(root)).toHaveLength(1);
  });

  it('hands concurrent first writes the same in-flight snapshot', async () => {
    await Promise.all([ensureSnapshot(), ensureSnapshot(), ensureSnapshot()]);
    expect(await listSnapshots(root)).toHaveLength(1);
  });

  it('resolves rather than blocking the write when snapshotting fails', async () => {
    // An unavailable safety net must not stop the work it was protecting.
    setProjectRoot(join(base, 'does-not-exist'));
    resetSnapshotMemo();
    await expect(ensureSnapshot()).resolves.toBeUndefined();
  });
});
