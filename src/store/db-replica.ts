/**
 * @role Pure helpers for recognizing and recovering a libSQL embedded replica on disk: which sidecar files a replica owns, whether a given db file is one, whether an error is the diverged-replica WalConflict that justifies a destructive wipe, and the wipe itself. Stateless — it never touches the open client, which is [db.md](./db.md)'s job.
 *
 * @readwhen
 * - Changing which sidecar files a replica wipe removes, or debugging a WalConflict that survives the re-pull.
 * - Changing how a sync replica is told apart from a plain local db file.
 */

import { existsSync, unlinkSync } from 'fs';

// libSQL replica sidecars. A recovery wipe MUST remove `-info` (sync metadata) or a
// WalConflict survives the re-pull; verified real dir has no `-meta`. See db.md.
const DB_FILE_SUFFIXES = ['', '-shm', '-wal', '-info', '-meta'] as const;

/** Remove the local db file and all its libSQL sidecars. Never throws. */
export function wipeLocalDb(url: string): void {
  const dbPath = url.replace(/^file:/, '');
  for (const suffix of DB_FILE_SUFFIXES) {
    try { unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

/**
 * True for a libSQL WalConflict (diverged replica → wipe + re-pull); NOT transient
 * network/auth errors, which must not trigger a destructive wipe. See db.md.
 */
export function isReplicaConflict(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /WalConflict/i.test(msg);
}

/** True when the db file at `url` is a libSQL embedded replica (has an `-info` sync-metadata sidecar). See db.md. */
export function isSyncReplica(url: string): boolean {
  return existsSync(url.replace(/^file:/, '') + '-info');
}
