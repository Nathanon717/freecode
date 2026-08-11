import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import { withSnapshotGate } from '../../../src/agent/tools/snapshot-gate.js';
import { resetSnapshotMemo } from '../../../src/snapshots/auto.js';
import { listSnapshots } from '../../../src/snapshots/index.js';
import { setProjectRoot } from '../../../src/agent/workspace.js';
import type { AnyCoreTool } from '../../../src/agent/tools/wrappers.js';

let base = '';
let root = '';
let originalHome: string | undefined;
const originalRoot = process.cwd();

/** A tool that lets a test observe the project's state at the moment it runs. */
function spyTool(onExecute: () => Promise<void> | void = () => void 0): AnyCoreTool {
  return {
    description: 'test',
    parameters: z.object({}),
    execute: async () => {
      await onExecute();
      return 'done';
    },
  };
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'freecode-gate-'));
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

describe('withSnapshotGate', () => {
  it.each(['create', 'edit', 'shell_exec'])('snapshots before %s runs', async (name) => {
    // The snapshot must already exist by the time the raw tool is entered —
    // that is what makes it pre-mutation state, not a record of the damage.
    let snapshotsAtExecute = -1;
    const gated = withSnapshotGate(
      name,
      spyTool(async () => {
        snapshotsAtExecute = (await listSnapshots(root)).length;
      }),
    );

    await expect(gated.execute?.({}, undefined as never)).resolves.toBe('done');
    expect(snapshotsAtExecute).toBe(1);
  });

  it.each(['read', 'grep', 'list_dir', 'spawn_agent'])(
    'leaves %s completely untouched',
    (name) => {
      const raw = spyTool();
      expect(withSnapshotGate(name, raw)).toBe(raw);
    },
  );

  it('takes one snapshot per process, not one per call', async () => {
    const gated = withSnapshotGate('create', spyTool());
    await gated.execute?.({}, undefined as never);

    const [snapshot] = await listSnapshots(root);
    expect(snapshot).toBeDefined();
    // A second call after a mutation must not re-snapshot, or the net would
    // capture the damage instead of the state before it.
    await writeFile(join(root, 'a.txt'), 'written by the tool\n');
    await gated.execute?.({}, undefined as never);
    expect((await listSnapshots(root)).map((s) => s.id)).toEqual([snapshot.id]);
  });

  it('passes a tool with no execute through unchanged', () => {
    const raw = { description: 'test', parameters: z.object({}) } as unknown as AnyCoreTool;
    expect(withSnapshotGate('create', raw)).toBe(raw);
  });
});
