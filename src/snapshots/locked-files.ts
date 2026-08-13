/**
 * @role Puts the project's files back, turning a path another process is holding open into a named warning instead of a thrown error or — worse — silence. The restore it serves is [index.md](index.md); what it stages is [coverage.md](coverage.md).
 *
 * @readwhen
 * - A `checkpoint revert` reported success while one of the agent's files was still on disk, or failed with nothing but git's own error text.
 * - Changing how the worktree half of a restore runs, or what a revert says about paths it could not write.
 */

// Ignored files entered snapshot coverage (snapshots/coverage.ts), which put
// running databases and build output inside the blast radius of a revert. A file
// the OS will not let git rewrite is now an ordinary event rather than a rare one.
//
// **`read-tree -u --reset` is not all-or-nothing**, and that measured fact is what
// this module is built on. Against a file held the way SQLite holds one
// (`FILE_SHARE_READ` — readable, not replaceable), git restores every other path,
// including ones sorting *after* the locked one and including deletions, then
// reports what it could not touch. So there is nothing to retry and nothing to
// exclude: the restore already happened. The plan's original shape — re-run with
// the failed paths excluded from the pathspec — is not available anyway, because
// `read-tree` takes tree-ish arguments, not a pathspec (`-- db.sqlite` is read as
// a second tree and dies with `Not a valid object name`).
//
// Two failure shapes, and the dangerous one is the quiet one:
//
//   error: unable to unlink old 'db'   a file it had to REPLACE — exit 128
//   warning: unable to unlink 'db'     a file it had to DELETE  — exit 0
//
// The second is an agent-created file surviving `checkpoint revert` while git
// reports success, which is the exact class of failure this plan exists to close —
// and `runGit` discards stderr on a zero exit, so today nobody sees it at all.

import { stagingArgs } from './coverage.js';
import { runShadowGit, runShadowGitCapturing, withScratchIndex } from './shadow-repo.js';

/**
 * Restores the worktree to `ref`, returning the paths git could not write.
 *
 * An empty array is a complete restore. A non-empty one is not a warning the
 * caller may drop: those paths still hold whatever the agent left in them.
 *
 * Load-bearing, and shared with the caller's own comment: `read-tree` updates the
 * worktree by diffing the *index* against the target tree, so the index must first
 * describe the post-damage state or agent-created files will not be deleted. Both
 * calls share one scratch index for that reason.
 */
export async function restoreWorktree(
  shadowDir: string,
  projectRoot: string,
  ref: string,
): Promise<string[]> {
  try {
    const stderr = await withScratchIndex(shadowDir, async (indexFile) => {
      await runShadowGit(shadowDir, projectRoot, stagingArgs(), indexFile);
      const run = await runShadowGitCapturing(
        shadowDir,
        projectRoot,
        ['read-tree', '-u', '--reset', ref],
        indexFile,
      );
      return run.stderr;
    });
    // Exit 0 and still incomplete: the delete-failure shape above.
    return lockedPaths(stderr);
  } catch (error) {
    const stderr = stderrOf(error);
    const locked = lockedPaths(stderr);
    // Narrow on purpose, like `isObjectWriteCollision`: only a failure whose every
    // error line is an unlink git could not do is known to have restored the rest.
    // A missing ref, a full disk, or a shape nobody has measured must still throw,
    // because "everything else is back" would be a guess about them.
    if (locked.length === 0 || !fullyExplained(stderr)) throw error;
    return locked;
  }
}

/**
 * The sentence a revert prints for the paths it could not write.
 *
 * Both ways out are named because only one of them ever finishes. Re-running the
 * revert works when the holder is transient — an editor, a stray `git` — and
 * `read-tree -u --reset` is idempotent, so it is safe and completes the job. It
 * never works for a dev server that holds its database for as long as it runs,
 * and that is the case this exists for; there, the paths are the user's own and
 * `checkpoint accept` is the honest end of the review.
 */
export function lockedFilesWarning(paths: string[]): string {
  return (
    `${paths.length} path(s) could not be written, so they still hold what the agent left ` +
    `in them:\n${paths.map((path) => `  ${path}`).join('\n')}\n` +
    'Everything else is back. Another program has those files open — a dev server on its ' +
    'database, an editor, a git GUI. Close it and run the same `freecode checkpoint revert` ' +
    'again to finish the job; repeating it is safe. If those paths are yours to keep as they ' +
    'are, `freecode checkpoint accept` ends the review instead.'
  );
}

/**
 * The paths in git's stderr it said it could not unlink.
 *
 * Both spellings in one pattern: `old ` marks a file being replaced (an `error:`,
 * which fails the call) and its absence marks one being deleted (a `warning:`,
 * which does not). The distinction is git's, not ours — either way the path kept
 * the agent's content, so a revert has to name both.
 */
function lockedPaths(stderr: string): string[] {
  const found = new Set<string>();
  for (const line of stderr.split('\n')) {
    const match = /^(?:error|warning): unable to unlink (?:old )?'(.+)':/.exec(line.trim());
    if (match) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Whether every failure git reported is one of those unlinks — the condition for
 * trusting that the rest of the tree really was restored.
 *
 * `fatal: updating files failed` is the summary line `read-tree` exits on once one
 * entry failed, so it is expected rather than a second, unexplained fault.
 */
function fullyExplained(stderr: string): boolean {
  return stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('error:') || line.startsWith('fatal:'))
    .every(
      (line) =>
        /^error: unable to unlink (?:old )?'.+':/.test(line) ||
        line === 'fatal: updating files failed',
    );
}

/** `execFile` hangs the child's stderr off the rejection; a non-exec failure has none. */
function stderrOf(error: unknown): string {
  const stderr = (error as { stderr?: unknown })?.stderr;
  return typeof stderr === 'string' ? stderr : '';
}
