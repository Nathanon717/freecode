# src/snapshots/coverage.ts - Snapshot Coverage

<!-- BEGIN GENERATED MAP INTENT -->
## Role

What a snapshot covers: the one `git add` that take, diff and restore all stage with, the directories left out of it, and the list a revert prints of what it therefore left alone. Split from [index.md](index.md) at the line limit.

## Read When

- Changing which files a snapshot covers, or adding an exclusion — every operation in [index.md](index.md) stages through `stagingArgs`, and they must not diverge.
- A revert deleted, restored, or skipped a file someone did not expect.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * The staging step every snapshot operation shares — take, diff, and restore.
 *
 * **All three must pass the same thing.** The tree is built from this, the diff is
 * read from this, and restore's `read-tree` deletes by diffing *this* index against
 * the snapshot tree; a restore staging less than the snapshot captured would leave
 * behind exactly the files the diff had just shown. One builder, three callers, so
 * they cannot drift apart.
 *
 * `-f` is what covers ignored files. It overrides the shadow repo's `info/exclude`
 * as well as the project's `.gitignore` — which is why that file is no longer
 * written (snapshots/shadow-repo.ts) and why exclusions have to be pathspecs. `git`
 * still skips any directory named `.git` by itself, so that half of coverage is
 * staged separately by `gitDirStagingArgs` below.
 */
stagingArgs(): string[]

/**
 * The staging step for the project's own `.git`, run against it as a second work
 * tree (snapshots/gitdir.ts) — so these paths are relative to `.git` itself.
 *
 * `*.lock` is excluded at any depth because those files are git's own transient
 * ones: `index.lock` exists for the milliseconds of someone else's commit, and
 * capturing one would mean a later revert *recreating* it, wedging every git
 * command in the project with "Another git process seems to be running". Git
 * forbids a real ref from ending in `.lock`, so nothing worth keeping matches.
 */
gitDirStagingArgs(): string[]

/**
 * The paths inside `.git` that `checkpoint diff` reports on — the RCE surface of
 * finding A3 and nothing else. Kept beside `stagingArgs` because it is the same
 * question ("what does a review see?") answered for the other work tree; the
 * reasoning for the narrowness is on `gitDirDiff` in snapshots/gitdir.ts.
 */
gitDirDiffPaths(): string[]

/**
 * The excluded directories that are really in this project, relative and slashed,
 * so a revert can name what it left alone.
 *
 * A constant note ("files ignored by .gitignore were left as they are") is what this
 * replaces, and it was both false once ignored files entered the snapshot and
 * useless before that: the reviewer could not tell "no `node_modules` here" from "a
 * `node_modules` full of payloads, untouched". Naming the paths that exist is the
 * difference.
 *
 * The walk prunes at every match and at `.git`, so it costs a directory listing per
 * surviving directory rather than a walk of what it is excluding — the whole reason
 * those paths are excluded in the first place.
 */
listExcludedPaths(projectRoot: string, limit?: number): string[]
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`snapshots/gitdir.ts`](gitdir.md) ×4, [`snapshots/index.ts`](index.md) ×2, [`cli/checkpoint.ts`](../cli/checkpoint.md) ×1, [`snapshots/locked-files.ts`](locked-files.md) ×1

## Tests

`tests/snapshots/coverage.test.ts`.

## Budget

152 / 500 lines (348 to spare).

## Env

`FREECODE_SNAPSHOT_EXCLUDE`
<!-- END GENERATED MAP FACTS -->

## Why this is one module and not three call sites

`takeSnapshot`, `snapshotDiff` and `restoreSnapshot` in [index.md](index.md) all begin by staging
the project into a scratch index, and **they must stage identically**. Restore deletes by diffing
its own index against the snapshot tree, so a restore that staged *less* than the snapshot
captured would leave behind precisely the files the diff had just shown a reviewer. One builder
with three callers makes that class of bug unavailable; three copies of an arg list would not.

## What is covered

Everything under the project root except the excluded directory names — **gitignored files
included**. A payload under `dist/` was previously invisible to `checkpoint diff` *and* survived
`checkpoint revert`, needing no `.gitignore` edit in any normal JS project, and an ignored `.env`
the agent deleted was gone for good (finding A2 in
[../../agent-containment-audit.md](../../agent-containment-audit.md)).

`-f` is what does that, and it is blunt: it overrides the shadow repo's `info/exclude` as well as
the project's `.gitignore` — which is why [shadow-repo.md](shadow-repo.md) no longer writes one,
and why exclusions here have to be pathspecs. `git` still skips any directory named `.git` during
the worktree walk regardless of `-f`, verified both ways, so that half of coverage is a **second
work tree** rather than a looser add: `gitDirStagingArgs` here, driven by
[gitdir.md](gitdir.md).

The two staging steps are therefore not interchangeable. `stagingArgs` runs against the project
and excludes directory *names* at any depth; `gitDirStagingArgs` runs rooted at `.git` and
excludes `*.lock`, because git's own transient lock files are the one thing in there a revert must
never recreate — restoring an `index.lock` wedges every later git command with "Another git
process seems to be running".

## The two exclusions

| Name | Why |
| --- | --- |
| `node_modules` | Prevention, not backup: containment mounts it read-only (C3), so there is nothing to hide in it — and it is 316 MB here against 4 MB for everything else ignored. |
| `.freecode` | freecode's own store — live SQLite plus `-wal`/`-shm` — inside the project whenever freecode runs from source there. |

`.freecode` is not a staleness question. `read-tree -u` **fails** on files a running process holds
open on Windows, and it fails part-way through, so including it broke `checkpoint revert` outright
in freecode's own dev setup. Proved with a live libsql connection; excluded, the same test restores
cleanly and the database passes `PRAGMA integrity_check`.

Both are matched at any depth (`:(exclude,glob)**/<name>/**`), so a monorepo's nested
`node_modules` are out too. `FREECODE_SNAPSHOT_EXCLUDE` **replaces** the list rather than adding
to it — comma-separated, empty for none. An env var rather than a `config.json` key because
`loadConfig()` reads the DB cache and [../cli/checkpoint.md](../cli/checkpoint.md) deliberately
runs before the store loads; snapshots are already configured this way
(`FREECODE_SNAPSHOT_DIR`).

## What a revert prints, and why it walks

`listExcludedPaths` names the excluded directories that really exist. It replaced a constant note
("files ignored by .gitignore were left as they are") that became false the moment ignored files
entered coverage, and had never been actionable anyway: a reviewer could not tell an absent
`node_modules` from an untouched one full of payloads.

The walk prunes at every match and at `.git`, so it costs one listing per *surviving* directory —
walking into the thing being excluded would spend exactly the time the exclusion exists to save.
The `limit` caps the output for a monorepo with a hundred of them.

## Cost of the width

Measured on this repo, tracked-only against covering ignored files: first snapshot in a project
3.0s → 11.8s, every snapshot after 0.20s → 0.29s, store after three snapshots 1.8 MB → 4.3 MB
(12.1 MB of it before `.freecode` was excluded). Cold is file *count*, not bytes — ~1800 extra small files
for git to hash — and it is paid once per project, while the warm path is what every delegated
run's first write waits on. The e2e harness pre-warms the shared store before the run because a
cold walk inside a `waitFor` budget broke two TTY scenarios.

Capturing `.git` adds a second walk on top of that — 12s cold, 0.1s warm, ~19 MB here — taking the
first snapshot in a project to roughly 24s. Its own numbers and its own stat cache are on
[gitdir.md](gitdir.md). The same pre-warm covers it, because the harness warms by taking a real
snapshot rather than by staging the project itself.

## Two consequences that are not fixed here

- **A revert now deletes and restores ignored files.** Build output and local databases sit inside
  the blast radius where they used to sit outside it, and a file the OS will not let git rewrite
  aborts the restore part-way through — R5 in
  [../../agent-containment-plan.md](../../agent-containment-plan.md).
- **Their contents enter the shadow repo, which never runs `git gc`.** A `.env` captured once
  persists there in plaintext even after `pruneSnapshots` drops the ref (C13 in the audit, which
  this makes materially worse).
