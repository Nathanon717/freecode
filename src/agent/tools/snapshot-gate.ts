/**
 * @role The innermost wrapper in the tool stack: takes the session's checkpoint snapshot immediately before the first write tool actually executes. Composed by `wrap` in [wrappers.md](wrappers.md).
 *
 * @readwhen
 * - Changing which tools arm the checkpoint net, or where in the wrapper stack it is armed.
 * - Debugging a snapshot that captured post-mutation state, or one that never fired.
 */

// Placed INSIDE every other wrapper, and that placement is load-bearing.
//
// Innermost means it fires exactly when the raw tool is about to mutate, which
// is the definition of "pre-agent state": a denied call never reaches here, a
// read-only tool's pre-confirmation precompute never reaches here, and a future
// `requiresConfirmation = false` cannot route around it the way a hook bolted
// onto the approval path could. It also sits inside `withSerializedExecution`'s
// queue, so two write calls in the same step cannot race to snapshot.

import { isWriteTool } from './tool-names.js';
import { ensureSnapshot } from '../../snapshots/auto.js';
import type { AnyCoreTool } from './wrappers.js';

type ToolExecuteFn = (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;

/** Arms the checkpoint net for `create`, `edit`, and `shell_exec`; every other tool passes through untouched. */
export function withSnapshotGate(name: string, t: AnyCoreTool): AnyCoreTool {
  if (!t.execute || !isWriteTool(name)) return t;
  const original: ToolExecuteFn = t.execute as ToolExecuteFn;
  return {
    ...t,
    execute: async (args: Record<string, unknown>, opts: unknown): Promise<unknown> => {
      // Resolves even when snapshotting failed — an unavailable safety net must
      // not block the write. See snapshots/auto.ts.
      await ensureSnapshot();
      return original(args, opts);
    },
  };
}
