/**
 * @role Captures and restores the project's own `.git` directory — the half of snapshot coverage a `git add` cannot reach — as a second work tree over the same shadow repo. What a snapshot covers otherwise is [coverage.md](coverage.md); the snapshot it hangs off is [index.md](index.md).
 *
 * @readwhen
 * - Debugging a revert that put files back but left config, hooks, refs, or the staged/unstaged split as the agent left them.
 * - Changing what is captured inside `.git`, or what `checkpoint diff` shows from it.
 * - A revert warned that the git directory could not be restored, or left it half-restored.
 */

// `.git` cannot be folded into the project's own staging step, and both halves of
// that were verified rather than assumed: git skips any directory named `.git`
// during the worktree walk, so `add -f -- . .git` stages nothing of it, and
// `read-tree --prefix=.git/` is refused outright (`invalid path '.git/config'`),
// so the tree cannot be grafted in under its own name either.
//
// So it is captured as a SECOND work tree — the same shadow repo driven with
// `--work-tree=<project>/.git` — producing a tree whose paths are relative to
// `.git` itself (`config`, `hooks/pre-commit`, `refs/heads/main`). That tree's
// commit is recorded as the **parent** of the snapshot commit, so the one ref
// already protecting the snapshot protects this too and `pruneSnapshots` needs no
// second namespace.
//
// This closes A3 (docs/agent-containment-audit.md): `git config core.hooksPath`
// was RCE that survived a revert and never appeared in a diff. It makes a planted
// hook **reversible, not harmless** — it still executes during the agent's own
// session — which is why the regex guards stay until containment lands (C5).

import { statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { gitDirDiffPaths, gitDirStagingArgs } from './coverage.js';
import { retryingObjectWrites, runShadowGit, withScratchIndex } from './shadow-repo.js';

/**
 * The project's `.git`, or undefined when there is nothing to capture.
 *
 * A `.git` **file** rather than a directory means a linked worktree or a
 * submodule, whose real git dir lives outside the project and therefore outside
 * anything a project snapshot may write to. Those are skipped: capture returns
 * undefined and restore is never reached, so such a project keeps exactly the
 * pre-R3 behaviour rather than a half-applied version of the new one.
 */
function gitDirPath(projectRoot: string): string | undefined {
  const path = join(projectRoot, '.git');
  try {
    return statSync(path).isDirectory() ? path : undefined;
  } catch {
    return undefined;
  }
}

/** The stat cache for the `.git` walk. Separate from the project's — see `withScratchIndex`. */
function gitDirCacheIndex(shadowDir: string): string {
  return join(shadowDir, 'freecode-index', 'gitdir.index');
}

/**
 * Commits the project's `.git` into the shadow repo and returns that commit, or
 * undefined when the project has no `.git` directory to capture.
 *
 * Cost is a file count, not bytes: ~3600 files and 12s cold on this repo, 0.1s
 * warm, and packfiles dedupe by content hash so a second snapshot stores only
 * what actually changed. Cold is paid once per project, on the first write of the
 * first delegated run.
 */
export async function captureGitDir(
  shadowDir: string,
  projectRoot: string,
): Promise<string | undefined> {
  const gitDir = gitDirPath(projectRoot);
  if (!gitDir) return undefined;

  return withScratchIndex(
    shadowDir,
    async (indexFile) => {
      await retryingObjectWrites(() =>
        runShadowGit(shadowDir, gitDir, gitDirStagingArgs(), indexFile),
      );
      const tree = (
        await retryingObjectWrites(() => runShadowGit(shadowDir, gitDir, ['write-tree'], indexFile))
      ).trim();
      return (
        await retryingObjectWrites(() =>
          runShadowGit(shadowDir, gitDir, ['commit-tree', tree, '-m', 'freecode-snapshot-gitdir']),
        )
      ).trim();
    },
    { cache: gitDirCacheIndex(shadowDir) },
  );
}

/**
 * Puts `.git` back to what `commit` recorded: config, hooks, refs, logs, objects,
 * and the index — which is what makes HEAD, branch deletions, and the
 * staged/unstaged split recover as a side effect of one call rather than three
 * mechanisms.
 *
 * Recreates `.git` if the agent deleted it outright; that case used to be a
 * warning saying history was gone for good.
 *
 * **Throws rather than swallowing**, because the failure is not cosmetic. A file
 * the OS will not let git *replace* aborts `read-tree -u` mid-write (exit 128) and
 * leaves refs rolled back with a stale index — `git fsck` then reports a broken
 * cache-tree. Demonstrated by holding `.git/index` open the way SQLite does, which
 * is the same shape that forced `.freecode` out of coverage in R2. A file it
 * cannot *delete* is only a warning and exits 0, so a locked packfile is harmless.
 * The caller's job is to say so and keep the review lock; the fix is to run the
 * revert again once the holder lets go, which was verified to repair the state
 * completely — `read-tree -u --reset` is idempotent.
 */
export async function restoreGitDir(
  shadowDir: string,
  projectRoot: string,
  commit: string,
): Promise<void> {
  const gitDir = join(projectRoot, '.git');
  await mkdir(gitDir, { recursive: true });

  await withScratchIndex(
    shadowDir,
    async (indexFile) => {
      // Same reason as the project restore: `read-tree` deletes by diffing the
      // *index* against the target tree, so the index must first describe the
      // post-agent state or a planted hook survives the revert that reported it
      // gone.
      await runShadowGit(shadowDir, gitDir, gitDirStagingArgs(), indexFile);
      await runShadowGit(
        shadowDir,
        gitDir,
        ['read-tree', '-u', '--reset', commit],
        indexFile,
      );
    },
    { cache: gitDirCacheIndex(shadowDir) },
  );
}

/**
 * What changed inside `.git` that a reviewer must actually see: `config` and
 * `hooks/`, and nothing else.
 *
 * Those two are the whole RCE surface the finding is about — `core.hooksPath` and
 * the scripts it points at — and they are small, textual, and stable. Refs, logs,
 * and objects are deliberately left out: they churn on every git command the agent
 * runs, and a diff nobody can read is not review coverage. Branch deletions are
 * therefore *recovered* by a revert without being *shown* by the diff.
 *
 * Returns '' when there is nothing to show, including when the snapshot predates
 * gitdir capture or the project has no `.git`.
 */
export async function gitDirDiff(
  shadowDir: string,
  projectRoot: string,
  commit: string | undefined,
): Promise<string> {
  const gitDir = gitDirPath(projectRoot);
  if (!commit || !gitDir) return '';

  const out = await withScratchIndex(
    shadowDir,
    async (indexFile) => {
      // Restaging only the two paths keeps this as cheap as the seed cache makes
      // it, and correct even with no seed: the diff is restricted to the same
      // paths, so entries the cold index is missing are ones it is not asked about.
      await runShadowGit(shadowDir, gitDir, ['add', '-A', '-f', '--', ...gitDirDiffPaths()], indexFile);
      return runShadowGit(
        shadowDir,
        gitDir,
        ['diff', '--cached', commit, '--', ...gitDirDiffPaths()],
        indexFile,
      );
    },
    // Read the cache, never write it: an index holding two paths saved over the
    // warm one would make the next `captureGitDir` re-walk `.git` from cold, and
    // reviewing a change is the step that most often comes right before it.
    { cache: gitDirCacheIndex(shadowDir), discard: true },
  );
  return out.trimEnd();
}
