# src/snapshots/index.ts - Snapshot Library

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Takes, lists, restores, and prunes agent checkpoint snapshots over the shadow repo. A library over `git` with no CLI concerns; the `freecode checkpoint` surface is [../cli/checkpoint.md](../cli/checkpoint.md).

## Read When

- Changing the restore sequence that puts a project back; *what* a snapshot captures is [coverage.md](coverage.md), and the worktree half that tolerates a file another process holds open is [locked-files.md](locked-files.md).
- Debugging a revert that left files right but history wrong; the `.git` capture that restores history is [gitdir.md](gitdir.md).
- Changing snapshot ids, retention, or the metadata carried in the snapshot commit message.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface SnapshotMeta {
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

interface RestoreOutcome {
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

/**
 * Captures the project as it is right now. Returns the snapshot's metadata.
 *
 * Throws if `git` is missing or the project cannot be read; callers on the
 * write-tool path swallow that (see snapshots/auto.ts) because a snapshot
 * failure must never block the write it was protecting.
 */
takeSnapshot(projectRoot: string): Promise<SnapshotMeta>

/**
 * Every snapshot for this project, newest first.
 */
listSnapshots(projectRoot: string): Promise<SnapshotMeta[]>

/**
 * `git diff --stat` between a snapshot and the project as it stands now.
 */
snapshotDiffStat(projectRoot: string, id: string): Promise<string>

/**
 * The unified patch between a snapshot and the project as it stands now —
 * every change the snapshot would undo, and nothing a concurrent editor did
 * before it was taken.
 */
snapshotDiffPatch(projectRoot: string, id: string): Promise<string>

/**
 * What changed inside the project's `.git` since a snapshot — `config` and
 * `hooks/` only, and '' when the snapshot captured no `.git`.
 *
 * Takes the meta rather than an id because the `.git` commit is the snapshot's
 * parent, which the caller has already read; looking it up again would be a
 * second `for-each-ref` for a field it is holding.
 */
snapshotGitDirDiff(projectRoot: string, meta: SnapshotMeta): Promise<string>

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
restoreSnapshot(projectRoot: string, id: string): Promise<RestoreOutcome>

/**
 * Keeps the `keep` newest snapshots and deletes the rest. Refs are what protect objects from gc.
 */
pruneSnapshots(projectRoot: string, keep: number): Promise<number>

/**
 * The incantation that lets a human poke at these snapshots by hand.
 */
inspectHint(projectRoot: string): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/shadow-repo.ts`](shadow-repo.md) ×29, [`snapshots/gitdir.ts`](gitdir.md) ×3, [`snapshots/coverage.ts`](coverage.md) ×2, [`snapshots/locked-files.ts`](locked-files.md) ×2
- **Imported by:** [`cli/checkpoint.ts`](../cli/checkpoint.md) ×17, [`snapshots/auto.ts`](auto.md) ×2

## Tests

`tests/snapshots/index.test.ts`. 4 other test files reference it.

## Budget

458 / 500 lines (42 to spare).
<!-- END GENERATED MAP FACTS -->

## What a snapshot is

**Two commits in the shadow repo**: the project's files, and the project's own `.git`
([gitdir.md](gitdir.md)) recorded as that commit's parent. The pre-run HEAD sha and branch are
in the commit message.

The second commit is what makes a revert put history back. It used to be a byte-copy of
`.git/index` plus a hand-written HEAD rollback, which restored the staged/unstaged split and
nothing else — config, hooks, branches and the reflog were whatever the agent left (finding A3).
Restoring the directory wholesale covers all of them in one operation, and the index comes back
with it, so the copy is gone.

The recorded HEAD and branch stayed. Not as the mechanism any more, but because they are the only
record of where HEAD *was* once it has been rolled back — what the CLI prints — and the only
record at all for a snapshot with no `.git` to restore.

## Restore sequence

```sh
git add -A                              # index must describe the post-disaster state...
git read-tree -u --reset <tree>         # ...or read-tree won't delete agent-created files
                                        # then, rooted at .git, the same two calls again:
git --work-tree=.git add -A             # config, hooks, refs, logs, objects, index
git --work-tree=.git read-tree -u --reset <gitdir-commit>
```

`.git` goes **last**: it holds the index that describes the worktree, so restoring it first and
then failing on the files would leave the two disagreeing.

`headRestored` reports *history was rolled back*, not *HEAD happens to be correct* — it compares
where HEAD was before the restore against what the snapshot recorded, so an ordinary revert (where
HEAD never moved) does not make the CLI announce a rollback that did not happen.

When the snapshot captured no `.git`, `restoreHead` still does it the old way: `update-ref` on the
branch, then `symbolic-ref` to move the checkout. That second write is the one that is easy to
miss — moving `refs/heads/<branch>` alone leaves a user who was `git checkout -b`'d standing on
the agent's branch while the revert reports success. A snapshot taken on a detached HEAD has no
branch to own the commit, so `update-ref --no-deref HEAD` writes HEAD itself instead.

## Guards are on what was recorded, not on what is true now

A project can gain or lose a `.git` mid-session, so the cases are decided by the snapshot, never
by the current directory:

| Recorded | Behavior |
| --- | --- |
| a `.git` commit | full restore, including a `.git` the agent deleted outright |
| none (not a repo, `.git` is a file, or a pre-R3 snapshot) | worktree, plus `restoreHead` if a HEAD was recorded and a `.git` is there now |
| a `.git` commit that will not restore | worktree kept, `restoreHead` attempted, and a warning saying to run the revert again — see [gitdir.md](gitdir.md) |

The worktree half has its own tolerance, and a different one: a path git could not write comes
back in `lockedPaths` rather than as an exception, because `read-tree -u --reset` restores
everything else before it gives up. [locked-files.md](locked-files.md) owns that judgement and the
measurements behind it. A non-empty `lockedPaths` is not cosmetic — the revert did not finish.

## What is covered, and the one thing that is not

**Everything under the project root except `node_modules` and `.freecode`, plus the project's own
`.git`** — gitignored files included. A
payload under `dist/` was previously invisible to `checkpoint diff` *and* survived
`checkpoint revert`, needing no `.gitignore` edit in any normal JS project, and an ignored
`.env` the agent deleted was gone for good (finding A2 in
[../../agent-containment-audit.md](../../agent-containment-audit.md)).

Two directory names are excluded, at any depth:

- **`node_modules`** — by *prevention* rather than backup: containment mounts it read-only (C3 in
  [../../agent-containment-plan.md](../../agent-containment-plan.md)), so there is nothing to hide
  in it, and it is 316 MB here against 4 MB for everything else ignored.
- **`.freecode`** — freecode's own store, live SQLite plus `-wal`/`-shm`, which is inside the
  project whenever freecode runs from source there. Not a staleness question: `read-tree -u`
  **fails** on files the running process holds open on Windows, and it fails part-way through, so
  including it broke `checkpoint revert` outright. Proved with a live libsql connection.

`FREECODE_SNAPSHOT_EXCLUDE` replaces the list (comma-separated, empty for none); it is an env
var rather than a config key because `loadConfig()` reads the DB cache and `checkpoint` runs
before the store loads.

Two consequences to keep in mind:

- **A revert now deletes and restores ignored files.** Build output, local databases, `.env` —
  all inside the blast radius where they used to be outside it. A file a running process holds
  open is why `.freecode` is excluded by name; a user's own live `dev.db` cannot be enumerated
  that way, and comes back as a named path in the revert's warnings instead
  ([locked-files.md](locked-files.md)).
- **Their contents enter the shadow repo, which never runs `git gc`** (C13). A `.env` captured
  once persists there in plaintext even after `pruneSnapshots` drops its ref.

`listExcludedPaths` is what a revert prints — the excluded directories that really exist,
walked with a prune at each match, so it costs a listing per surviving directory rather than a
walk of the thing being excluded. It replaced a constant "files ignored by .gitignore were left
as they are" note, which became false and was never actionable: it could not tell an absent
`node_modules` from an untouched one full of payloads.

## Cost

Measured on this repo, before and after ignored files came into scope:

| | tracked only | with ignored files |
| --- | --- | --- |
| first snapshot in a project | 3.0s | **11.8s** |
| every snapshot after | 0.20s | **0.29s** |
| store after three snapshots | 1.8 MB | **4.3 MB** |

Capturing `.git` adds a second walk of its own on top of the right-hand column: 12s cold, 0.1s
warm, ~19 MB of store here, taking a project's first snapshot to roughly **24s**
([gitdir.md](gitdir.md)).

The cold numbers are file *count*, not bytes — ~1800 extra small files (`dist/`, `coverage/`,
`evals/humaneval/.runs`) for git to hash, and ~3600 more inside `.git`. It is paid once per
project; the warm path is what every delegated run's first write actually waits on, and the
shared indexes keep it warm across sessions. The e2e harness pre-warms by taking one real
snapshot before the run, which warms both walks — a cold walk inside a `waitFor` budget is what
broke two TTY scenarios when coverage widened.

Snapshots do not dedup against the user's existing objects.

Ids are handed out synchronously and remembered per process, because the listing they are
checked against is stale the moment it is read — two snapshots issued in one tick would
otherwise pick the same id and the second `update-ref` would silently overwrite the first.
