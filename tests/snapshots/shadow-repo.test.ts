import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import {
  ensureShadowRepo,
  gitAvailable,
  indexCopyPath,
  retryingObjectWrites,
  shadowRepoPath,
} from '../../src/snapshots/shadow-repo.js';

let base = '';
let root = '';
let originalHome: string | undefined;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'freecode-shadow-'));
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

describe('shadowRepoPath', () => {
  it('puts the shadow repo under FREECODE_HOME, outside the project', () => {
    const location = shadowRepoPath(root);
    expect(location.relocated).toBe(false);
    expect(location.path.startsWith(join(base, 'home'))).toBe(true);
    expect(relative(root, location.path).startsWith('..')).toBe(true);
  });

  it('gives two checkouts sharing a basename separate histories', async () => {
    const other = join(base, 'elsewhere', 'proj');
    await mkdir(other, { recursive: true });
    expect(shadowRepoPath(root).path).not.toBe(shadowRepoPath(other).path);
  });

  it('relocates rather than refuses when FREECODE_HOME is inside the project', () => {
    // What the e2e and pty harnesses do. A shadow repo here would be deleted by
    // the `rm -rf` it exists to undo.
    process.env['FREECODE_HOME'] = join(root, '.freecode-home');
    const location = shadowRepoPath(root);

    expect(location.relocated).toBe(true);
    expect(relative(root, location.path).startsWith('..')).toBe(true);
  });
});

describe('ensureShadowRepo', () => {
  it('creates a bare repo carrying the attributes that protect line endings', async () => {
    const shadowDir = await ensureShadowRepo(root);

    expect(existsSync(join(shadowDir, 'HEAD'))).toBe(true);
    expect(await readFile(join(shadowDir, 'info', 'attributes'), 'utf-8')).toContain('* -text');
    expect(await readFile(join(shadowDir, 'info', 'exclude'), 'utf-8')).toContain('/.git/');
    expect(existsSync(join(shadowDir, 'freecode-index'))).toBe(true);
  });

  it('is idempotent, so a second session reuses the same history', async () => {
    const first = await ensureShadowRepo(root);
    expect(await ensureShadowRepo(root)).toBe(first);
  });
});

describe('indexCopyPath', () => {
  it('maps a snapshot id to its saved index and nothing else', () => {
    expect(indexCopyPath('/shadow.git', '20260101T000000-7')).toBe(
      join('/shadow.git', 'freecode-index', '20260101T000000-7.index'),
    );
  });
});

describe('gitAvailable', () => {
  it('finds the git binary this suite already depends on', async () => {
    await expect(gitAvailable()).resolves.toBe(true);
  });
});

describe('retryingObjectWrites', () => {
  // What git says when two processes write the same loose object on Windows.
  const collision = new Error(
    'Command failed: git add -A\nerror: unable to write file .git/objects/5a/72eb: Permission denied\nerror: failed to insert into database',
  );

  it('retries a lost race and returns the winner-freshened result', async () => {
    let calls = 0;
    const body = (): Promise<string> => {
      calls++;
      return calls === 1 ? Promise.reject(collision) : Promise.resolve('tree-sha');
    };

    await expect(retryingObjectWrites(body)).resolves.toBe('tree-sha');
    expect(calls).toBe(2);
  });

  // The gate is the whole safety argument: widened to any permission error, a
  // read-only snapshots directory becomes three attempts and the same failure.
  it('rethrows a permission error that is not an object collision, first attempt', async () => {
    const denied = new Error('Command failed: git add -A\nfatal: EACCES: permission denied');
    let calls = 0;
    const body = (): Promise<string> => {
      calls++;
      return Promise.reject(denied);
    };

    await expect(retryingObjectWrites(body)).rejects.toThrow(denied);
    expect(calls).toBe(1);
  });

  it('gives up rather than retrying forever, and reports the real error', async () => {
    let calls = 0;
    const body = (): Promise<string> => {
      calls++;
      return Promise.reject(collision);
    };

    await expect(retryingObjectWrites(body)).rejects.toThrow('failed to insert into database');
    expect(calls).toBe(3);
  });
});
