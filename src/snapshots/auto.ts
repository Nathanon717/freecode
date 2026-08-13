/**
 * @role The automatic half of `freecode checkpoint`: one snapshot per process, taken lazily immediately before the first write-tool call. Kept separate from [index.md](index.md) so the snapshot library stays callable more than once per process.
 *
 * @readwhen
 * - Changing when the automatic snapshot fires, or what happens when it fails — a failure is reported, never swallowed, and [../cli/headless-prompt.md](../cli/headless-prompt.md) is what acts on it.
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

/**
 * What this process's snapshot came to. Three states, not two: a run that wrote
 * nothing and a run whose snapshot failed both have no id, and treating them alike
 * is what released the review lock over unprotected work (finding A5/A6).
 */
export type SessionSnapshot =
  /** No write tool ever fired, so there was nothing to protect. */
  | { status: 'none' }
  | { status: 'taken'; id: string }
  /** Writes happened and no snapshot covers them. There is nothing to review against. */
  | { status: 'failed'; reason: string };

let pending: Promise<void> | null = null;
let outcome: SessionSnapshot = { status: 'none' };

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
    outcome = { status: 'taken', id: meta.id };
    log('snapshots', `took snapshot ${meta.id} of ${root}`);
    await pruneSnapshots(root, KEEP_SNAPSHOTS);
  } catch (error) {
    // Recorded as well as logged. The log is a file nobody reads under `-p`,
    // where the transcript is silenced — so the failure used to reach no caller
    // at all, and `-p --edit` released its review lock on the strength of it.
    outcome = { status: 'failed', reason: fault(error) };
    logError('snapshots', `snapshot failed for ${root}; this session has no checkpoint`, error);
  }
}

/**
 * One line naming what went wrong, for the stderr report.
 *
 * A failed `git` rejection stringifies to the whole invocation — `--git-dir`,
 * `--work-tree`, the format string — and then the actual fault on a later line.
 * Printing all of it buries the sentence a reader needs (`fatal: not a git
 * repository`) in an argument list they did not ask about. The log still has the
 * error entire, which is where the full command belongs.
 */
function fault(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lines = message.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return lines.find((line) => /^(fatal|error):/.test(line)) ?? lines[0] ?? 'unknown error';
}

/**
 * What this process's snapshot came to, once it has settled.
 *
 * The single answer to "does this run have unreviewed work, and is it
 * reviewable?", so nothing else has to keep a second flag that could disagree.
 * `failed` is deliberately not folded into `none`: the writes happened, and a
 * caller that cannot tell the two apart either abandons unprotected work with the
 * project marked free, or holds the lock over a run that never touched anything.
 * Neither is safe, and the second was the reason the two used to be one — but
 * `checkpoint accept` works with nothing snapshotted and is the documented way
 * out of a held lock, so a `failed` run strands nobody.
 */
export async function sessionSnapshot(): Promise<SessionSnapshot> {
  await pending;
  return outcome;
}

/** Test-only: drops the memo so a fresh snapshot can be taken in the same process. */
export function resetSnapshotMemo(): void {
  pending = null;
  outcome = { status: 'none' };
}
