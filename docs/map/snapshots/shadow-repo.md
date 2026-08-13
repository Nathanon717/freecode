# src/snapshots/shadow-repo.ts - Shadow Repo

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Locates and initializes the bare "shadow" git repo that backs agent checkpoint snapshots, and runs git against it with the project directory as its work tree.

## Read When

- Changing where snapshots live on disk, or the containment check that relocates them out of the project.
- Debugging line-ending corruption across a revert, which the `* -text` attribute written here is what prevents.
- Adding a git invocation that must target the shadow repo rather than the project's own `.git`.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface ShadowLocation {
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
shadowRepoPath(projectRoot: string): ShadowLocation

interface ScratchIndexOptions {
  /**
   * Stat cache to seed from and write back to. Defaults to the shadow repo's own
   * `index`, which is the project's; `.git` is a second work tree and keeps its
   * own (snapshots/gitdir.ts). Seeding one walk from the other's cache matches no
   * stat data at all and silently pays the cold cost every time.
   */
  cache?: string;
  /**
   * Skip the write-back, for an operation that stages only a handful of paths. Its
   * index describes a fraction of the tree, so saving it *over* a warm cache would
   * make the next full walk cold — 12s here — to no one's benefit.
   */
  discard?: boolean;
}

/**
 * Runs `body` against a private index, so two freecode processes in one project
 * cannot collide on the shadow repo's shared `index.lock`.
 *
 * The shared index is still used — as a **cache seed, never as a lock**. The staging
 * step re-hashes every file whose stat data it cannot match, so a cold scratch index
 * makes each snapshot walk the whole tree (~12s on this repo, ~0.3s with the cache).
 * Seeding from the shared copy and writing the result back keeps the stat cache warm
 * across sessions while leaving every operation independent: a lost race costs a
 * slower snapshot, never a failed one.
 */
withScratchIndex<T>(shadowDir: string, body: (indexFile: string) => Promise<T>, { cache, discard }?: ScratchIndexOptions): Promise<T>

/**
 * Creates the shadow repo if it is not there yet and returns its path.
 *
 * The write order is not optional: `init` first, then `info/attributes`, then
 * any `add`. Adding before the attribute file exists runs the first snapshot's
 * blobs through the user's clean filters, which is the silent CRLF corruption
 * the attribute exists to prevent.
 */
ensureShadowRepo(projectRoot: string): Promise<string>

/**
 * True when this project has a shadow repo, without creating one.
 */
shadowRepoExists(projectRoot: string): boolean

/**
 * Every project with snapshots under the active `$FREECODE_HOME`.
 */
listShadowProjects(): string[]

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
runShadowGit(shadowDir: string, projectRoot: string, args: string[], indexFile?: string | undefined): Promise<string>

/**
 * As {@link runShadowGit}, but hands back stderr as well.
 *
 * For the one caller that needs it: `read-tree -u` reports a file it could not
 * delete as a *warning* and exits 0, so a revert that silently left the agent's
 * file on disk is indistinguishable from a clean one unless somebody reads
 * stderr (snapshots/locked-files.ts). Everywhere else stderr is git's progress
 * chatter and dropping it is right.
 */
runShadowGitCapturing(shadowDir: string, projectRoot: string, args: string[], indexFile?: string | undefined): Promise<GitOutput>

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
retryingObjectWrites<T>(body: () => Promise<T>): Promise<T>

/**
 * Runs git against the project's own repo — only for the HEAD/branch rollback.
 */
runProjectGit(projectRoot: string, args: string[]): Promise<string>

/**
 * A scratch index path nothing else in this or any other process will touch.
 */
scratchIndexPath(shadowDir: string): string

/**
 * Both streams of a git call. Only the restore path reads the second one.
 */
interface GitOutput {
  stdout: string;
  stderr: string;
}

/**
 * Whether a `git` binary exists at all. Snapshots are impossible without one.
 */
gitAvailable(): Promise<boolean>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×2, [`config/index.ts`](../config/index.md) ×1
- **Imported by:** [`snapshots/index.ts`](index.md) ×29, [`snapshots/gitdir.ts`](gitdir.md) ×13, [`cli/checkpoint.ts`](../cli/checkpoint.md) ×4, [`snapshots/locked-files.ts`](locked-files.md) ×3, [`snapshots/review-lock.ts`](review-lock.md) ×1

## Tests

`tests/snapshots/shadow-repo.test.ts`. 5 other test files reference it.

## Budget

354 / 500 lines (146 to spare).

## Env

`FREECODE_SNAPSHOT_DIR`
<!-- END GENERATED MAP FACTS -->

## On-disk layout

```text
$FREECODE_HOME/snapshots/<basename>-<hash>.git/   # bare repo, created once
  info/attributes                                 # "* -text", written at creation
  refs/snapshots/<snapshot-id>                    # one ref per snapshot
  index                                           # stat cache for the project walk
  freecode-index/gitdir.index                     # stat cache for the .git walk
  freecode-index/scratch-<pid>-<rand>.index       # one per operation in flight
```

The two caches are separate because they describe two different work trees, and
`withScratchIndex` takes the one to seed from as an argument for that reason. Seeding the `.git`
walk from the project's cache would match no stat data at all and silently pay the cold cost —
12s a snapshot here — every time. Neither is ever locked: they are copied out, worked on, and
copied back best-effort.

## Ordering that is not optional

- `init` → write `info/attributes` → first `add`. Adding before the attribute file exists
  runs the first snapshot's blobs through the user's clean filters, which silently converts
  line endings on the way back out. Verified: with `core.autocrlf=true` and `* text=auto`, a
  round trip turned an LF file CRLF; `* -text` fixes it for both LF and CRLF files.
- Every git call runs with `cwd` at the project root. `add -A` resolves its pathspec against
  cwd, so the same `--git-dir`/`--work-tree` pair from elsewhere snapshots the wrong tree.
- Git identity is supplied by env, not read from config: `commit-tree` refuses to run without
  one, and a machine that has never configured git has none.

**No `info/exclude` is written.** It used to hold `/.git/` as "free insurance", and it never was
any: every snapshot operation stages with `add -f` ([index.md](index.md)), which overrides
`info/exclude` exactly as it overrides the project's `.gitignore` — verified both ways. What
keeps the project's `.git` out of the *project* tree is git skipping any directory of that name
during the worktree walk, which is why capturing it takes a second work tree rooted at `.git`
rather than a looser add ([gitdir.md](gitdir.md)).

## Concurrency

Two freecode processes in one project is the normal case, not an edge one —
`CLAUDE.md`'s standing rule is for an interactive session to delegate to
`freecode -p --edit`. Same project path means same hash means same shadow dir, so:

- **`git init` is not atomic.** A process that loses the race fails partway through, so
  creation catches the error and re-checks for `HEAD` rather than trusting its own attempt.
  In-process callers additionally share one creation promise.
- **Nothing stages into the shared index.** Callers pass `GIT_INDEX_FILE` (see
  `scratchIndexPath`); the shared `index` is read as a stat cache and written back
  best-effort, never locked. A lost race costs a slower snapshot, never a failed one — which
  matters because the snapshot hook swallows failures, so a collision would otherwise leave a
  session unprotected and silent.
- **The object database is shared, and on Windows it is not lock-free.** Racers snapshot the
  same content, so they write byte-identical loose objects. POSIX `rename` overwrites and git
  calls the collision a success; Windows cannot rename over the existing read-only object and
  `add -A` dies with `Permission denied` / `failed to insert into database`. Every call that
  writes objects therefore goes through `retryingObjectWrites` — on the retry the winner's
  object is on disk and git skips writing it. Do not wrap `update-ref` or the restore path in
  it: they write no objects, and a retry would re-run a partially applied change.

`freecode-project` records the absolute project path at creation, because the directory name
is hashed and cannot be read back. `undo` uses it to point someone at the right directory.

## `FREECODE_SNAPSHOT_DIR`

Moves the snapshots root independently of `$FREECODE_HOME`, the way `FREECODE_STORE` moves the
database. An empty value counts as unset, so a child can opt back out of an inherited
override. The e2e harness sets it suite-wide — see
[e2e-testing.md](../../e2e-testing.md#undo-snapshots-in-e2e-tests). It relocates snapshots; it
never disables them, and the containment check still applies to whatever it resolves to.
