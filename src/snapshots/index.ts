/**
 * @role Takes, lists, restores, and prunes agent checkpoint snapshots over the shadow repo. A library over `git` with no CLI concerns; the `freecode checkpoint` surface is [../cli/checkpoint.md](../cli/checkpoint.md).
 *
 * @readwhen
 * - Changing the restore sequence that puts a project back; *what* a snapshot captures is [coverage.md](coverage.md), and the worktree half that tolerates a file another process holds open is [locked-files.md](locked-files.md).
 * - Debugging a revert that left files right but history wrong; the `.git` capture that restores history is [gitdir.md](gitdir.md).
 * - Changing snapshot ids, retention, or the metadata carried in the snapshot commit message.
 */

// What is covered — gitignored files included, `node_modules` and `.freecode` not —
// and the one `git add` every operation here stages with both live in
// snapshots/coverage.ts. Take, diff and restore must not stage differently: restore
// deletes by diffing its own index against the snapshot tree, so a narrower one
// would leave behind exactly what the diff showed.
//
// A snapshot is TWO commits in the shadow repo: the project's files, and its own
// `.git` (snapshots/gitdir.ts) recorded as that commit's parent. The second one is
// what makes a revert put back history, branches, config, hooks — and the index,
// so the staged/unstaged split comes back with it rather than from the separate
// byte-copy this used to keep.
//
// The commit message still carries the pre-run HEAD sha and branch. Not as the
// rollback mechanism — restoring `.git` is that — but because it is the only
// record of where HEAD *was* that survives to be printed after the rollback, and
// the only one at all for a snapshot with no `.git` to restore.

import { existsSync } from 'fs';
import { join } from 'path';
import { stagingArgs } from './coverage.js';
import { captureGitDir, gitDirDiff, restoreGitDir } from './gitdir.js';
import { lockedFilesWarning, restoreWorktree } from './locked-files.js';
import {
  ensureShadowRepo,
  retryingObjectWrites,
  runProjectGit,
  runShadowGit,
  shadowRepoPath,
  withScratchIndex,
} from './shadow-repo.js';

export interface SnapshotMeta {
  id: string;
  /** Commit sha in the shadow repo. */
  commit: string;
  /**
   * Commit holding the project's `.git` (snapshots/gitdir.ts), recorded as this
   * snapshot's parent. Undefined for a project with no `.git` directory, and for
   * snapshots taken before that capture existed.
   */
  gitDir?: string;
  /** Project HEAD at snapshot time, or undefined when the project was not a git repo. */
  head?: string;
  /** Project branch at snapshot time, or undefined on a detached HEAD / non-repo. */
  branch?: string;
  takenAt: string;
}

export interface RestoreOutcome {
  id: string;
  /**
   * `.git` was put back wholesale — history, branches, config, hooks, and with the
   * index, the staged/unstaged split. False when the snapshot recorded none, and
   * when the restore of it failed (then `warnings` says so).
   */
  gitDirRestored: boolean;
  /** Whether history actually had to be rolled back — not merely "HEAD is right now". */
  headRestored: boolean;
  /**
   * Files another process was holding open, which therefore still hold whatever the
   * agent left in them (snapshots/locked-files.ts). Not a warning the caller may
   * treat as cosmetic: a non-empty list means the revert did not finish.
   */
  lockedPaths: string[];
  /** Non-fatal news the user must see — e.g. history that could not be recovered. */
  warnings: string[];
}

const REF_PREFIX = 'refs/snapshots/';

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
      runShadowGit(shadowDir, projectRoot, stagingArgs(), indexFile),
    );
    return (
      await retryingObjectWrites(() =>
        runShadowGit(shadowDir, projectRoot, ['write-tree'], indexFile),
      )
    ).trim();
  });
  // Taken after the project tree, so a `.git` that changes between the two is
  // captured no earlier than the files it describes.
  const gitDir = await captureGitDir(shadowDir, projectRoot);

  const message = [
    'freecode-snapshot',
    '',
    `head=${head ?? ''}`,
    `branch=${branch ?? ''}`,
    `time=${takenAt}`,
  ].join('\n');
  const commit = (
    await retryingObjectWrites(() =>
      runShadowGit(shadowDir, projectRoot, [
        'commit-tree',
        tree,
        // A parent, not a message field: this is what makes the `.git` commit
        // reachable from the snapshot's ref, so the one ref protects both objects
        // and `pruneSnapshots` needs no second namespace to delete.
        ...(gitDir ? ['-p', gitDir] : []),
        '-m',
        message,
      ]),
    )
  ).trim();
  await runShadowGit(shadowDir, projectRoot, ['update-ref', `${REF_PREFIX}${id}`, commit]);

  return { id, commit, gitDir, head, branch, takenAt };
}

/** Every snapshot for this project, newest first. */
export async function listSnapshots(projectRoot: string): Promise<SnapshotMeta[]> {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  if (!existsSync(join(shadowDir, 'HEAD'))) return [];

  // `%(body)` last: it is the only field that can contain the separator's
  // neighbours (newlines), so everything fixed-width has to be read before it.
  const format = '%(refname:strip=2)%00%(objectname)%00%(parent)%00%(body)%01';
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
      const [id, commit, parents = '', body = ''] = record.split('\x00');
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
        // Snapshot commits are never chained to each other, so the only parent a
        // snapshot can have is its `.git` capture — and older ones have none.
        gitDir: parents.trim().split(/\s+/)[0] || undefined,
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
    await runShadowGit(shadowDir, projectRoot, stagingArgs(), indexFile);
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
 * What changed inside the project's `.git` since a snapshot — `config` and
 * `hooks/` only, and '' when the snapshot captured no `.git`.
 *
 * Takes the meta rather than an id because the `.git` commit is the snapshot's
 * parent, which the caller has already read; looking it up again would be a
 * second `for-each-ref` for a field it is holding.
 */
export async function snapshotGitDirDiff(projectRoot: string, meta: SnapshotMeta): Promise<string> {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  return gitDirDiff(shadowDir, projectRoot, meta.gitDir);
}

/**
 * Puts the project back to `id`.
 *
 * The guards are on **what the snapshot recorded, not what is true now**: the
 * project can gain or lose a `.git` mid-session. A snapshot that captured one
 * restores it wholesale, which is what rolls back history, branches, config,
 * hooks and the index together; one that did not — an older snapshot, or a
 * project that was not a repo — falls back to moving HEAD by hand, which is all
 * that was ever possible for it.
 */
export async function restoreSnapshot(projectRoot: string, id: string): Promise<RestoreOutcome> {
  const { path: shadowDir } = shadowRepoPath(projectRoot);
  const meta = (await listSnapshots(projectRoot)).find((s) => s.id === id);
  // Covers a missing shadow repo too: no repo lists no snapshots, and restoring
  // must never be the thing that creates one.
  if (!meta) throw new Error(`No snapshot ${id}`);

  const warnings: string[] = [];
  // Read before anything moves: "was history rolled back" is a question about
  // the difference this call makes, and after the restore there is nothing left
  // to compare against.
  const before = await projectHead(projectRoot);

  // A path another process holds open comes back as a name rather than an
  // exception, because git restored everything else before it gave up — see
  // snapshots/locked-files.ts, which owns that whole judgement.
  const lockedPaths = await restoreWorktree(shadowDir, projectRoot, `${REF_PREFIX}${id}`);
  if (lockedPaths.length > 0) warnings.push(lockedFilesWarning(lockedPaths));

  // After the worktree, never before: `.git` holds the index that describes it,
  // so restoring it first and then failing to restore the files would leave the
  // two disagreeing.
  const gitDirRestored = meta.gitDir
    ? await tryRestoreGitDir(shadowDir, projectRoot, meta.gitDir, warnings)
    : false;

  const headRestored = gitDirRestored
    ? await rolledBack(projectRoot, meta, before)
    // Either there was no `.git` to restore, or restoring it failed part-way —
    // and in the second case moving HEAD by hand is the one repair still worth
    // attempting, since it writes two small refs rather than a whole directory.
    : existsSync(join(projectRoot, '.git')) && meta.head
      ? await restoreHead(projectRoot, meta.head, meta.branch, warnings)
      : false;

  return { id, gitDirRestored, headRestored, lockedPaths, warnings };
}

/**
 * Restores `.git`, turning a failure into a warning the caller prints rather than
 * an exception that loses the worktree restore that already succeeded.
 *
 * The advice is the whole point of the message. `read-tree -u --reset` is
 * idempotent, so running the same revert again after the holder releases the file
 * repairs the half-restored state completely — verified, including `git fsck`
 * coming back clean. Without that sentence the user is left with a repo whose
 * fsck complains and no reason to think a retry would help.
 */
async function tryRestoreGitDir(
  shadowDir: string,
  projectRoot: string,
  commit: string,
  warnings: string[],
): Promise<boolean> {
  try {
    await restoreGitDir(shadowDir, projectRoot, commit);
    return true;
  } catch (error) {
    warnings.push(
      `Your files were restored, but the .git directory was not fully put back ` +
      `(${error instanceof Error ? error.message.split('\n')[0] : String(error)}). ` +
      'That usually means another program is holding a file inside .git open — an editor, ' +
      'a git GUI, or a running `git` command. Close it and run the same `freecode checkpoint ' +
      'revert` again: repeating it is safe and finishes the job.',
    );
    return false;
  }
}

/**
 * Whether restoring `.git` actually moved history, by comparing where HEAD was
 * before with where the snapshot recorded it.
 *
 * Not "HEAD is correct now" — on an ordinary revert HEAD never moved, and
 * `checkpoint` must not announce a rollback that did not happen.
 */
async function rolledBack(
  projectRoot: string,
  meta: SnapshotMeta,
  before: { head?: string; branch?: string },
): Promise<boolean> {
  if (before.head === meta.head && before.branch === meta.branch) return false;
  const now = await projectHead(projectRoot);
  return now.head === meta.head && now.branch === meta.branch;
}

/**
 * Puts HEAD back where the snapshot found it — the branch ref *and* the
 * checkout — for the snapshots that cannot do it the wholesale way.
 *
 * Three callers reach here, all real: a snapshot taken before `.git` was captured
 * at all, one taken of a project whose `.git` is a file (a linked worktree, whose
 * real git dir is outside the project), and a `.git` restore that failed part-way.
 * The last is why this stayed after `restoreGitDir` took over the common path —
 * writing two ref files can still succeed where rewriting a whole directory did not.
 *
 * Rewriting `refs/heads/<branch>` alone is not a rollback. An agent that runs
 * `git checkout -b work && git commit` leaves HEAD pointing at its own branch,
 * so moving the old branch ref underneath it restores nothing the user can see:
 * they are still on the agent's branch, on the agent's commit, while the revert
 * reports success. `symbolic-ref` is what actually moves them back, and it is
 * safe here precisely because `read-tree` has already restored the worktree —
 * a `checkout` would fight it.
 *
 * Returns whether history actually had to be rolled back, which is not the same
 * as "HEAD is now correct" — on an ordinary revert HEAD never moved, and the
 * caller must not announce a rollback that did not happen.
 */
async function restoreHead(
  projectRoot: string,
  head: string,
  branch: string | undefined,
  warnings: string[],
): Promise<boolean> {
  const resolve = (ref: string) => runProjectGit(projectRoot, ['rev-parse', ref])
    .then((sha) => sha.trim())
    .catch(() => '');
  // A detached HEAD makes `symbolic-ref` exit non-zero rather than print a ref,
  // and that is an answer — "on no branch" — not a failure. It is also what the
  // snapshot recorded as an absent branch, so the two compare directly.
  const onBranch = await runProjectGit(projectRoot, ['symbolic-ref', '--quiet', 'HEAD'])
    .then((ref) => ref.trim())
    .catch(() => '');
  const wanted = branch ? `refs/heads/${branch}` : '';

  // Nothing moved. Every write below would be a no-op that still appends a
  // reflog entry claiming a rollback, so return before touching anything —
  // and report false, because there was no history to restore.
  if (onBranch === wanted && await resolve('HEAD') === head) return false;

  // The commit can be gone: `git gc --prune=now` after the agent deleted the
  // refs holding it collects it, and then there is nothing to point at. Say so
  // rather than failing the whole revert — the files are already back.
  try {
    await runProjectGit(projectRoot, ['cat-file', '-e', `${head}^{commit}`]);
  } catch {
    warnings.push(
      `The pre-run commit ${head.slice(0, 8)} is no longer in the object store, so HEAD was left ` +
      'where it is. Your files were restored; the commit history was not.',
    );
    return false;
  }

  try {
    if (branch) {
      await runProjectGit(projectRoot, ['update-ref', `refs/heads/${branch}`, head]);
      if (onBranch !== wanted) {
        await runProjectGit(projectRoot, ['symbolic-ref', 'HEAD', wanted]);
      }
    } else {
      // Detached at snapshot time: there is no branch to own the commit, so
      // HEAD holds it directly. `--no-deref` is what writes HEAD itself rather
      // than whatever it currently points at.
      await runProjectGit(projectRoot, ['update-ref', '--no-deref', 'HEAD', head]);
    }
  } catch (error) {
    warnings.push(
      `HEAD could not be restored to ${head.slice(0, 8)} (${error instanceof Error ? error.message : String(error)}). ` +
      'Your files were restored; check `git status` before continuing.',
    );
    return false;
  }

  return (await runProjectGit(projectRoot, ['rev-parse', 'HEAD'])).trim() === head;
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
