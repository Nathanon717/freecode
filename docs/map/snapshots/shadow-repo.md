# src/snapshots/shadow-repo.ts - Shadow Repo

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Locates and initializes the bare "shadow" git repo that backs agent undo snapshots, and runs git against it with the project directory as its work tree.

## Read When

- Changing where snapshots live on disk, or the containment check that relocates them out of the project.
- Debugging line-ending corruption across an undo, which the `* -text` attribute written here is what prevents.
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

/**
 * Byte-copy of the project's `.git/index` taken alongside snapshot `id`.
 */
indexCopyPath(shadowDir: string, id: string): string

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
 * index removes the contention instead of racing it.
 */
runShadowGit(shadowDir: string, projectRoot: string, args: string[], indexFile?: string | undefined): Promise<string>

/**
 * Runs git against the project's own repo — only for the HEAD/branch rollback.
 */
runProjectGit(projectRoot: string, args: string[]): Promise<string>

/**
 * A scratch index path nothing else in this or any other process will touch.
 */
scratchIndexPath(shadowDir: string): string

/**
 * Whether a `git` binary exists at all. Snapshots are impossible without one.
 */
gitAvailable(): Promise<boolean>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`config/index.ts`](../config/index.md) ×1, [`logger.ts`](../logger.md) ×1
- **Imported by:** [`snapshots/index.ts`](index.md) ×23, [`cli/undo.ts`](../cli/undo.md) ×4

## Tests

`tests/snapshots/shadow-repo.test.ts`. 1 other test file references it.

## Budget

240 / 500 lines (260 to spare).

## Env

`FREECODE_SNAPSHOT_DIR`
<!-- END GENERATED MAP FACTS -->

## On-disk layout

```text
$FREECODE_HOME/snapshots/<basename>-<hash>.git/   # bare repo, created once
  info/attributes                                 # "* -text", written at creation
  info/exclude                                    # "/.git/"
  refs/snapshots/<snapshot-id>                    # one ref per snapshot
  freecode-index/<snapshot-id>.index              # byte-copy of the project's .git/index
```

## Ordering that is not optional

- `init` → write `info/attributes` → first `add`. Adding before the attribute file exists
  runs the first snapshot's blobs through the user's clean filters, which silently converts
  line endings on the way back out. Verified: with `core.autocrlf=true` and `* text=auto`, a
  round trip turned an LF file CRLF; `* -text` fixes it for both LF and CRLF files.
- Every git call runs with `cwd` at the project root. `add -A` resolves its pathspec against
  cwd, so the same `--git-dir`/`--work-tree` pair from elsewhere snapshots the wrong tree.
- Git identity is supplied by env, not read from config: `commit-tree` refuses to run without
  one, and a machine that has never configured git has none.

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

`freecode-project` records the absolute project path at creation, because the directory name
is hashed and cannot be read back. `undo` uses it to point someone at the right directory.

## `FREECODE_SNAPSHOT_DIR`

Moves the snapshots root independently of `$FREECODE_HOME`, the way `FREECODE_STORE` moves the
database. An empty value counts as unset, so a child can opt back out of an inherited
override. The e2e harness sets it suite-wide — see
[e2e-testing.md](../../e2e-testing.md#undo-snapshots-in-e2e-tests). It relocates snapshots; it
never disables them, and the containment check still applies to whatever it resolves to.
