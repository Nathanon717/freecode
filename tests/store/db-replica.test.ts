import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isReplicaConflict, isSyncReplica, wipeLocalDb } from '../../src/store/db-replica.js';

// These helpers are pure file/string predicates — no client, no env. A temp dir is
// all they need.
let tempStore = '';

beforeEach(() => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-db-replica-'));
});

afterEach(() => {
  rmSync(tempStore, { recursive: true, force: true });
});

describe('db-replica: isReplicaConflict', () => {
  // A WalConflict is thrown and requires a destructive wipe+re-pull. "local state is
  // incorrect" is NOT thrown (libSQL self-heals) and must NOT match — wiping on it
  // would discard a replica libSQL is about to legitimately re-pull.
  it.each([
    ['ERROR libsql::sync: insert error (frame=84): WalConflict', true],
    ['WalConflict', true],
    ['local state is incorrect, db file exists but metadata file does not', false],
    ['network timeout', false],
    ['401 Unauthorized', false],
  ])('%s → %s', (message, expected) => {
    expect(isReplicaConflict(new Error(message))).toBe(expected);
  });

  it('handles non-Error values without throwing', () => {
    expect(isReplicaConflict('WalConflict')).toBe(true);
    expect(isReplicaConflict(null)).toBe(false);
  });
});

describe('db-replica: wipeLocalDb', () => {
  it('removes the db file and every libSQL sidecar including `-info`', () => {
    const dbPath = join(tempStore, 'freecode.db');
    const suffixes = ['', '-shm', '-wal', '-info', '-meta'];
    for (const s of suffixes) writeFileSync(dbPath + s, 'x');

    wipeLocalDb('file:' + dbPath);

    for (const s of suffixes) expect(existsSync(dbPath + s)).toBe(false);
  });

  it('never throws when the files are absent', () => {
    expect(() => wipeLocalDb('file:' + join(tempStore, 'nonexistent.db'))).not.toThrow();
  });
});

describe('db-replica: isSyncReplica', () => {
  it('is true only when the `-info` sync-metadata sidecar exists', () => {
    const dbPath = join(tempStore, 'freecode.db');
    writeFileSync(dbPath, 'x');
    expect(isSyncReplica('file:' + dbPath)).toBe(false);

    writeFileSync(dbPath + '-info', 'x');
    expect(isSyncReplica('file:' + dbPath)).toBe(true);
  });
});
