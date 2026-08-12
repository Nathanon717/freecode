/**
 * @role Takes, lists, restores, and prunes agent checkpoint snapshots over the shadow repo. A library over `git` with no CLI concerns; the `freecode checkpoint` surface is [../cli/checkpoint.md](../cli/checkpoint.md).
 *
 * @readwhen
 * - Changing what a snapshot captures, or the restore sequence that puts a project back.
 * - Debugging a revert that left files right but history wrong, or one that skipped the index copy.
 * - Changing snapshot ids, retention, or the metadata carried in the snapshot commit message.
 */

// The snapshot is a commit in the shadow repo plus a byte-copy of the project's
// `.git/index`. The tree alone would flatten staged and unstaged into one blob;
// the index copy is what restores the exact staged/unstaged split. The commit
// message carries the pre-run HEAD sha and branch, because a rogue `shell_exec`
// can `git commit` or `git reset --hard`, and restoring files alone would leave
// HEAD moved and the agent's commit in history.

import { copyFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  ensureShadowRepo,
  indexCopyPath,
  retryingObjectWrites,
  runProjectGit,
  runShadowGit,
  scratchIndexPath,
  shadowRepoPath,
} from './shadow-repo.js';

export interface SnapshotMeta {
  id: string;
  /** Commit sha in the shadow repo. */
  commit: string;
  /** Project HEAD at snapshot time, or undefined when the project was not a git repo. */
  head?: string;
  /** Project branch at snapshot time, or undefined on a detached HEAD / non-repo. */
  branch?: string;
  takenAt: string;
}

export interface RestoreOutcome {
  id: string;
  indexRestored: boolean;
  headRestored: boolean;
  /** Non-fatal news the user must see — e.g. history that could not be recovered. */
  warnings: string[];
}

const REF_PREFIX = 'refs/snapshots/';

/**
 * Runs `body` against a private index, so two freecode processes in one project
 * cannot collide on the shadow repo's shared `index.lock`.
 *
 * The shared index is still used — as a **cache seed, never as a lock**. `add -A`
 * re-hashes every file whose stat data it cannot match, so a cold scratch index
 * makes each snapshot walk the whole tree (~4s on this repo, ~2s with the cache).
 * Seeding from the shared copy and writing the result back keeps the stat cache
 * warm across sessions while leaving every operation independent: a lost race
 * costs a slower snapshot, never a failed one.
 */
async function withScratchIndex<T>(
  shadowDir: string,
  body: (indexFile: string) => Promise<T>,
): Promise<T> {
  const sharedIndex = join(shadowDir, 'index');
  const indexFile = scratchIndexPath(shadowDir);
  await copyFile(sharedIndex, indexFile).catch(() => undefined);
  try {
    const result = await body(indexFile);
    await copyFile(indexFile, sharedIndex).catch(() => undefined);
    return result;
  } finally {
    await rm(indexFile, { force: true }).catch(() => undefined);
  }
}

/**
 * `YYYYMMDDTHHMMSS` (UTC) plus the process id, with `-<n>` on collision.
 *
 * The timestamp alone is not enough: the hook fires on the first write, a
 * project can be re-entered, and two snapshots in the same second would
 * silently overwrite each other. The plan pins the discriminator as the session
 * id; freecode has no process-wide session identifier, so the pid stands in —
 * it is unique per run, which is the property actually needed.
 */
function snapshotId(existing: Set<string>): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
  const base = `${stamp}-${process.pid}`;
  const taken = (candidate: string): boolean => existing.has(candidate) || issued.has(candidate);

  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}-${n}`;
  // Recorded synchronously. `existing` came from a listing that is already stale
  // by the time it is read, so two snapshots issued in the same tick would
  // otherwise pick the same id and the second `update-ref` would overwrite the
  // first — losing a snapshot rather than colliding loudly.
  issued.add(id);
  return id;
}

/** Ids handed out by this process, whether or not their ref has been written yet. */
const issued = new Set<string>();

/** HEAD sha and branch of the *project's* repo, or an empty object if it is not one. */
async function projectHead(projectRoot: string): Promise<{ head?: string; branch?: string }> {
  if (!existsSync(join(projectRoot, '.git'))) return {};
  try {
    const head = (await runProjectGit(projectRoot, ['rev-parse', 'HEAD'])).trim();
    const branch = (await runProjectGit(projectRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    // A detached HEAD reports "HEAD"; there is no branch ref to roll back.
    return { head, branch: branch === 'HEAD' ? undefined : branch };
  } catch {
    // A repo with no commits yet: nothing to roll back to, files still snapshot.
    return {};
  }
}

/**
 * Captures the project as it is right now. Returns the snapshot's metadata.
 *
 * Throws if `git` is missing or the project cannot be read; callers on the
 * write-tool path swallow that (see snapshots/auto.ts) because a snapshot
 * failure must never block the write it was protecting.
 */
export async function takeSnapshot(projectRoot: string): Promise<SnapshotMeta> {
  const shadowDir = await ensureShadowRepo(projectRoot);
  const existing = new Set((await listSnapshots(projectRoot)).map((s) => s.id));
  const id = snapshotId(existing);
  const { head, branch } = await projectHead(projectRoot);
  const takenAt = new Date().toISOString();

  // `add`, `write-tree` and `commit-tree` are the calls that write objects, and
  // two sessions snapshotting one project write the same ones — see
  // `retryingObjectWrites`.
  const tree = await withScratchIndex(shadowDir, async (indexFile) => {
    await retryingObjectWrites(() =>
      runShadowGit(shadowDir, projectRoot, ['add', '-A'], indexFile),
    );
    return (
      await retryingObjectWrites(() =>
        runShadowGit(shadowDir, projectRoot, ['write-tree'], indexFile),
      )
    ).trim();
  });
  const message = [
    'freecode-snapshot',
    '',
    `head=${head ?? ''}`,
    `branch=${branch ?? ''}`,
    `time=${takenAt}`,
  ].join('\n');
  const commit = (
    await retryingObjectWrites(() =>
      runShadowGit(shadowDir, projectRoot, ['commit-tree', tree, '-m', message]),
    )
  ).trim();
  await runShadowGit(shadowDir, projectRoot, ['update-ref', `${REF_PREFIX}${id}`, commit]);

  // Only a git project has an index to copy. Its absence is what restore later
  // keys on to decide whether it may touch `.git/index` at all.
  const projectIndex = join(projectRoot, '.git', 'index');
  if (existsSync(projectIndex)) {
    await mkdir(join(shadowDir, 'freecode-index'), { recursive: true });
    await copyFile(projectIndex, indexCopyPath(shadowDir, id));
  }

  return { id, commit, head, branch, takenAt };
}

/** Every snapshot for this project, newest first. */
export async function listSnapshots(projectRoot: string): Promise<SnapshotMeta[]> {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  if (!existsSync(join(shadowDir, 'HEAD'))) return [];

  const format = '%(refname:strip=2)%00%(objectname)%00%(body)%01';
  const raw = await runShadowGit(shadowDir, projectRoot, [
    'for-each-ref',
    `--format=${format}`,
    'refs/snapshots',
  ]);

  const metas = raw
    .split('\x01')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.trim() !== '')
    .map((record) => {
      const [id, commit, body = ''] = record.split('\x00');
      const fields = new Map(
        body
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.includes('='))
          .map((line) => {
            const at = line.indexOf('=');
            return [line.slice(0, at), line.slice(at + 1)] as const;
          }),
      );
      return {
        id,
        commit,
        head: fields.get('head') || undefined,
        branch: fields.get('branch') || undefined,
        takenAt: fields.get('time') ?? '',
      };
    });

  return metas.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/**
 * `git diff <flavour>` between a snapshot and the project as it stands now.
 *
 * The staging step is what makes the answer mean "everything this snapshot
 * would undo": a plain `git diff <ref>` against the shadow repo reports only
 * paths git already knows about, so files the agent *created* would silently
 * not appear. `add -A` into a scratch index puts them in the comparison, and
 * `--cached` is then what reads that index rather than the worktree.
 *
 * Doing it in a scratch index is what keeps this safe to call from a read-only
 * command: nothing the user owns is touched, and a read never creates a repo.
 */
async function snapshotDiff(projectRoot: string, id: string, flavour: string[]): Promise<string> {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  const out = await withScratchIndex(shadowDir, async (indexFile) => {
    await runShadowGit(shadowDir, projectRoot, ['add', '-A'], indexFile);
    return runShadowGit(
      shadowDir,
      projectRoot,
      ['diff', '--cached', ...flavour, `${REF_PREFIX}${id}`],
      indexFile,
    );
  });
  return out.trimEnd();
}

/** `git diff --stat` between a snapshot and the project as it stands now. */
export async function snapshotDiffStat(projectRoot: string, id: string): Promise<string> {
  return snapshotDiff(projectRoot, id, ['--stat']);
}

/**
 * The unified patch between a snapshot and the project as it stands now —
 * every change the snapshot would undo, and nothing a concurrent editor did
 * before it was taken.
 */
export async function snapshotDiffPatch(projectRoot: string, id: string): Promise<string> {
  return snapshotDiff(projectRoot, id, []);
}

/**
 * Puts the project back to `id`.
 *
 * The guards are on **what the snapshot recorded, not what is true now**: the
 * project can gain or lose a `.git` mid-session. With no index recorded the
 * worktree is restored and `.git/index` is never written — if the project is a
 * repo now, its index belongs to history this snapshot knows nothing about.
 */
export async function restoreSnapshot(projectRoot: string, id: string): Promise<RestoreOutcome> {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  const meta = (await listSnapshots(projectRoot)).find((s) => s.id === id);
  // Covers a missing shadow repo too: no repo lists no snapshots, and restoring
  // must never be the thing that creates one.
  if (!meta) throw new Error(`No snapshot ${id}`);

  const warnings: string[] = [];

  // Load-bearing: `read-tree` updates the worktree by diffing the *index*
  // against the target tree, so the index must first describe the post-disaster
  // state or agent-created files will not be deleted. Both halves share one
  // scratch index for that reason.
  await withScratchIndex(shadowDir, async (indexFile) => {
    await runShadowGit(shadowDir, projectRoot, ['add', '-A'], indexFile);
    await runShadowGit(
      shadowDir,
      projectRoot,
      ['read-tree', '-u', '--reset', `${REF_PREFIX}${id}`],
      indexFile,
    );
  });

  const savedIndex = indexCopyPath(shadowDir, id);
  const projectGitDir = join(projectRoot, '.git');
  let indexRestored = false;
  let headRestored = false;

  if (existsSync(savedIndex)) {
    if (existsSync(projectGitDir)) {
      // The restored index carries stale stat data, so the first `git status`
      // after a revert re-hashes. Correct, just slower.
      await copyFile(savedIndex, join(projectGitDir, 'index'));
      indexRestored = true;
      if (meta.head && meta.branch) {
        const current = (await runProjectGit(projectRoot, ['rev-parse', 'HEAD'])).trim();
        if (current !== meta.head) {
          await runProjectGit(projectRoot, ['update-ref', `refs/heads/${meta.branch}`, meta.head]);
          headRestored = true;
        }
      }
    } else {
      warnings.push(
        'The project\'s .git directory is gone, so commit history, branches, and reflog were NOT recovered — only your files were.',
      );
    }
  }

  return { id, indexRestored, headRestored, warnings };
}

/** Keeps the `keep` newest snapshots and deletes the rest. Refs are what protect objects from gc. */
export async function pruneSnapshots(projectRoot: string, keep: number): Promise<number> {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  const snapshots = await listSnapshots(projectRoot);
  const doomed = snapshots.slice(Math.max(keep, 0));
  for (const snapshot of doomed) {
    await runShadowGit(shadowDir, projectRoot, ['update-ref', '-d', `${REF_PREFIX}${snapshot.id}`]);
  }
  return doomed.length;
}

/** The incantation that lets a human poke at these snapshots by hand. */
export function inspectHint(projectRoot: string): string {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  return `git --git-dir="${shadowDir}" --work-tree="${projectRoot}" log --all --oneline`;
}
