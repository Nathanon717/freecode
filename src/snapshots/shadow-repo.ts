/**
 * @role Locates and initializes the bare "shadow" git repo that backs agent undo snapshots, and runs git against it with the project directory as its work tree.
 *
 * @readwhen
 * - Changing where snapshots live on disk, or the containment check that relocates them out of the project.
 * - Debugging line-ending corruption across an undo, which the `* -text` attribute written here is what prevents.
 * - Adding a git invocation that must target the shadow repo rather than the project's own `.git`.
 */

// A snapshot is a commit in a bare repo that lives OUTSIDE the project and is
// driven over it with `--git-dir`/`--work-tree`. Nothing is written into the
// user's repo: no refs, no objects, no index-lock contention, nothing to clean
// up if freecode is killed mid-run — and it works in directories that are not
// git repos at all. See `docs/undo-snapshots-plan.md` for the rejected
// alternatives (`git stash create` excludes untracked files; refs under the
// user's own repo need `* -text` in *their* `.git/info/attributes`, which is
// transient mutation of shared state).

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createHash, randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { getConfigDir } from '../config/index.js';
import { log } from '../logger.js';

const execFileAsync = promisify(execFile);

/** Snapshot output is metadata and file lists, never file contents — but a big tree lists long. */
const MAX_GIT_OUTPUT_BYTES = 32 * 1024 * 1024;

/**
 * `commit-tree` refuses to run without a committer identity, and a machine that
 * has never configured git has none. The snapshot must not depend on the user's
 * git config being complete, so it always supplies its own.
 */
const IDENTITY_ENV = {
  GIT_AUTHOR_NAME: 'freecode',
  GIT_AUTHOR_EMAIL: 'freecode@localhost',
  GIT_COMMITTER_NAME: 'freecode',
  GIT_COMMITTER_EMAIL: 'freecode@localhost',
};

export interface ShadowLocation {
  /** Absolute path to the bare shadow repo (`…/snapshots/<basename>-<hash>.git`). */
  path: string;
  /** True when the containment check moved it out of `$FREECODE_HOME`. */
  relocated: boolean;
}

/**
 * Where this project's snapshots live.
 *
 * The hash suffix is load-bearing: two checkouts sharing a basename would
 * otherwise share one snapshot history.
 *
 * **Containment check.** `$FREECODE_HOME` is an env var, and the e2e and pty
 * harnesses redirect it — sometimes to a directory inside the project under
 * test. A shadow repo inside the project sits in its own blast radius: deleted
 * by the `rm -rf` it exists to undo, and snapshotting itself every run. On that
 * condition it falls back to the real config dir. **Relocate, never refuse** —
 * a netless `--edit` run is precisely the failure being prevented, so this
 * check must not be able to disable the net.
 */
export function shadowRepoPath(projectRoot: string): ShadowLocation {
  const root = resolve(projectRoot);
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
  const name = `${basename(root).replace(/[^\w.-]/g, '_') || 'project'}-${hash}.git`;

  const preferred = join(snapshotsRoot(), name);
  if (!isInside(root, preferred)) return { path: preferred, relocated: false };

  return { path: join(homedir(), '.config', 'freecode', 'snapshots', name), relocated: true };
}

/**
 * The directory every project's shadow repo sits under.
 *
 * `FREECODE_SNAPSHOT_DIR` moves it independently of `$FREECODE_HOME`, the same
 * way `FREECODE_STORE` moves the database. The e2e and pty harnesses need it:
 * they hand every test its own `$FREECODE_HOME`, which would otherwise make each
 * one re-pay a cold snapshot of the whole repo under test — seconds apiece, in
 * parallel, for a net none of them are exercising. Pointing them all at one
 * directory pays that once. It relocates snapshots; it never disables them.
 */
function snapshotsRoot(): string {
  // Empty counts as unset, so a child can opt back out of an inherited override
  // — which is how the one e2e scenario that reads the shadow repo back keeps a
  // directory to itself while every other test shares one.
  const override = process.env['FREECODE_SNAPSHOT_DIR']?.trim();
  return override ? override : join(getConfigDir(), 'snapshots');
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Byte-copy of the project's `.git/index` taken alongside snapshot `id`. */
export function indexCopyPath(shadowDir: string, id: string): string {
  return join(shadowDir, 'freecode-index', `${id}.index`);
}

/** Names the project a shadow repo belongs to, since its directory name is hashed. */
const PROJECT_MARKER = 'freecode-project';

let warnedRelocation = false;

/**
 * Creates the shadow repo if it is not there yet and returns its path.
 *
 * The write order is not optional: `init` first, then `info/attributes`, then
 * any `add`. Adding before the attribute file exists runs the first snapshot's
 * blobs through the user's clean filters, which is the silent CRLF corruption
 * the attribute exists to prevent.
 */
export function ensureShadowRepo(projectRoot: string): Promise<string> {
  const { path: shadowDir, relocated } = shadowRepoPath(projectRoot);
  if (relocated && !warnedRelocation) {
    warnedRelocation = true;
    log('snapshots', `FREECODE_HOME resolves inside the project; snapshots relocated to ${shadowDir}`);
  }

  // Concurrent callers in this process share one creation, and a failed one is
  // dropped so the next attempt can retry rather than inherit the error.
  const inFlight = creating.get(shadowDir);
  if (inFlight) return inFlight;
  const started = createShadowRepo(projectRoot, shadowDir).finally(() => {
    creating.delete(shadowDir);
  });
  creating.set(shadowDir, started);
  return started;
}

const creating = new Map<string, Promise<string>>();

async function createShadowRepo(projectRoot: string, shadowDir: string): Promise<string> {
  if (!existsSync(join(shadowDir, 'HEAD'))) {
    await mkdir(shadowDir, { recursive: true });
    // Another freecode process can be initializing the same directory right now
    // — two sessions in one project is the normal case. `git init` is not
    // atomic and fails partway through when it loses that race, so the only
    // question that matters afterwards is whether the repo is there.
    try {
      await runGit(['init', '--bare', '--quiet', shadowDir], projectRoot);
    } catch (error) {
      if (!existsSync(join(shadowDir, 'HEAD'))) throw error;
    }
    await mkdir(join(shadowDir, 'info'), { recursive: true });
    // Without this, restore re-applies smudge filters and silently rewrites line
    // endings. It lives in freecode's own git dir, so it is written once and
    // never touched again — no shared state is mutated.
    await writeFile(join(shadowDir, 'info', 'attributes'), '* -text\n', 'utf-8');
    // A shadow git-dir does not swallow the project's `.git` anyway; this is
    // free insurance.
    await writeFile(join(shadowDir, 'info', 'exclude'), '/.git/\n', 'utf-8');
    // The directory name carries a hash, so it cannot be read back. `undo` uses
    // this to tell someone standing in the wrong directory where their
    // snapshots actually are.
    await writeFile(join(shadowDir, PROJECT_MARKER), `${resolve(projectRoot)}\n`, 'utf-8');
  }
  await mkdir(join(shadowDir, 'freecode-index'), { recursive: true });
  return shadowDir;
}

/** True when this project has a shadow repo, without creating one. */
export function shadowRepoExists(projectRoot: string): boolean {
  return existsSync(join(shadowRepoPath(projectRoot).path, 'HEAD'));
}

/** Every project with snapshots under the active `$FREECODE_HOME`. */
export function listShadowProjects(): string[] {
  const snapshotsDir = snapshotsRoot();
  if (!existsSync(snapshotsDir)) return [];
  return readdirSync(snapshotsDir)
    .map((entry) => join(snapshotsDir, entry, PROJECT_MARKER))
    .filter((marker) => existsSync(marker))
    .map((marker) => readFileSync(marker, 'utf-8').trim())
    .filter((path) => path !== '');
}

/**
 * Runs git with the shadow repo as the git dir and the project as the work tree.
 *
 * `indexFile` is not optional in practice for anything that stages: the shadow
 * repo's own index is shared by every freecode process in this project, and
 * `CLAUDE.md` makes concurrent sessions the normal case (an interactive session
 * delegating to `freecode -p --edit`). Two `add -A` runs against one index
 * collide on `index.lock`, and the snapshot hook swallows failures — so the
 * second session would run unprotected and silently. A per-operation scratch
 * index removes that contention instead of racing it.
 *
 * The object database is still shared, and it is not lock-free on Windows — see
 * `retryingObjectWrites`, which every object-writing call here goes through.
 */
export function runShadowGit(
  shadowDir: string,
  projectRoot: string,
  args: string[],
  indexFile?: string,
): Promise<string> {
  return runGit(
    ['--git-dir', shadowDir, '--work-tree', projectRoot, ...args],
    projectRoot,
    indexFile,
  );
}

/**
 * Runs a shadow-git command that writes objects, retrying a lost race.
 *
 * Two sessions snapshotting one project hash the *same* content, so they race to
 * create the same loose object. POSIX `rename` overwrites atomically and git
 * treats the collision as success; on Windows the object is already there and
 * read-only, the link/rename fails EACCES, and `add -A` dies with "failed to
 * insert into database". The loser has nothing to do but look again — by the
 * time it retries, the winner's object is on disk and git skips writing it. A
 * genuine permissions fault still surfaces, one backoff later.
 *
 * Wrap the calls that write objects (`add`, `write-tree`, `commit-tree`), not
 * `update-ref` or anything on the restore path — those do not write objects, and
 * a retry there would re-run a partially applied change.
 */
export async function retryingObjectWrites<T>(body: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await body();
    } catch (error) {
      if (attempt >= OBJECT_WRITE_ATTEMPTS || !isObjectWriteCollision(error)) throw error;
      log('snapshots', `lost a loose-object race, retrying (attempt ${attempt + 1})`);
      await delay(OBJECT_WRITE_BACKOFF_MS * attempt);
    }
  }
}

const OBJECT_WRITE_ATTEMPTS = 3;
const OBJECT_WRITE_BACKOFF_MS = 25;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Narrow on purpose: both halves must match, so a read-only snapshots directory
 * is reported on the first attempt instead of being retried into a slower
 * version of the same error.
 */
function isObjectWriteCollision(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /permission denied|EACCES|EPERM/i.test(message) &&
    /unable to write|failed to insert into database/i.test(message)
  );
}

/** Runs git against the project's own repo — only for the HEAD/branch rollback. */
export function runProjectGit(projectRoot: string, args: string[]): Promise<string> {
  return runGit(args, projectRoot);
}

/** A scratch index path nothing else in this or any other process will touch. */
export function scratchIndexPath(shadowDir: string): string {
  const unique = `${process.pid}-${randomBytes(6).toString('hex')}`;
  return join(shadowDir, 'freecode-index', `scratch-${unique}.index`);
}

/**
 * Every call runs with `cwd` at the project root: `add -A` resolves its pathspec
 * against cwd, so a shadow git-dir driven from an unrelated directory snapshots
 * the wrong tree.
 *
 * `commit.gpgsign` is forced off because it is commonly set globally, and a
 * `commit-tree` that stops to ask for a passphrase would hang the write it is
 * protecting.
 */
async function runGit(args: string[], cwd: string, indexFile?: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-c', 'commit.gpgsign=false', ...args], {
    cwd,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    env: {
      ...process.env,
      ...IDENTITY_ENV,
      ...(indexFile ? { GIT_INDEX_FILE: indexFile } : {}),
    },
  });
  return stdout;
}

/** Whether a `git` binary exists at all. Snapshots are impossible without one. */
export async function gitAvailable(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'], { maxBuffer: 1024 * 64 });
    return true;
  } catch {
    return false;
  }
}
