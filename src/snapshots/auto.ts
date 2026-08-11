/**
 * @role The automatic half of undo: one snapshot per process, taken lazily immediately before the first write-tool call. Kept separate from [index.md](index.md) so the snapshot library stays callable more than once per process.
 *
 * @readwhen
 * - Changing when the automatic snapshot fires, or what happens when it fails.
 * - Debugging a session that snapshotted twice, or one that captured post-mutation state.
 * - Changing the retention count applied after each automatic snapshot.
 */

// The memo is at module scope on purpose. `createTools()` state is per
// streamText attempt, not per session (see agent/tools/index.ts), so a run-once
// flag threaded through there would re-snapshot every turn — and the second
// snapshot would capture *post-mutation* state, destroying the thing being
// protected. One promise per process is the only scope that means "before the
// agent touched anything".

import { projectRoot } from '../agent/workspace.js';
import { log, logError } from '../logger.js';
import { pruneSnapshots, takeSnapshot } from './index.js';

/** How many snapshots survive per project. Older refs are deleted, which is what lets gc reclaim them. */
const KEEP_SNAPSHOTS = 20;

let pending: Promise<void> | null = null;

/**
 * Snapshots the project the first time it is called in this process, and is a
 * no-op every time after.
 *
 * Never rejects. A missing `git` binary, an unwritable config dir, or a corrupt
 * shadow repo must not block the write this was protecting — refusing writes
 * because the safety net is unavailable inverts the point of having one, so the
 * failure is logged and the call proceeds unprotected.
 */
export function ensureSnapshot(): Promise<void> {
  // Assigned synchronously, before any await: two tool calls entering together
  // must observe the same promise, not each start their own snapshot.
  if (!pending) pending = runSnapshot();
  return pending;
}

async function runSnapshot(): Promise<void> {
  const root = projectRoot;
  try {
    const meta = await takeSnapshot(root);
    log('snapshots', `took snapshot ${meta.id} of ${root}`);
    await pruneSnapshots(root, KEEP_SNAPSHOTS);
  } catch (error) {
    logError('snapshots', `snapshot failed for ${root}; this session is not undoable`, error);
  }
}

/** Test-only: drops the memo so a fresh snapshot can be taken in the same process. */
export function resetSnapshotMemo(): void {
  pending = null;
}
