# src/snapshots/index.ts - Snapshot Library

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Takes, lists, restores, and prunes agent checkpoint snapshots over the shadow repo. A library over `git` with no CLI concerns; the `freecode checkpoint` surface is [../cli/checkpoint.md](../cli/checkpoint.md).

## Read When

- Changing what a snapshot captures, or the restore sequence that puts a project back.
- Debugging a revert that left files right but history wrong, or one that skipped the index copy.
- Changing snapshot ids, retention, or the metadata carried in the snapshot commit message.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface SnapshotMeta {
  id: string;
  /** Commit sha in the shadow repo. */
  commit: string;
  /** Project HEAD at snapshot time, or undefined when the project was not a git repo. */
  head?: string;
  /** Project branch at snapshot time, or undefined on a detached HEAD / non-repo. */
  branch?: string;
  takenAt: string;
}

interface RestoreOutcome {
  id: string;
  indexRestored: boolean;
  headRestored: boolean;
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
 * Puts the project back to `id`.
 *
 * The guards are on **what the snapshot recorded, not what is true now**: the
 * project can gain or lose a `.git` mid-session. With no index recorded the
 * worktree is restored and `.git/index` is never written — if the project is a
 * repo now, its index belongs to history this snapshot knows nothing about.
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

- **Imports:** [`snapshots/shadow-repo.ts`](shadow-repo.md) ×26
- **Imported by:** [`cli/checkpoint.ts`](../cli/checkpoint.md) ×14, [`snapshots/auto.ts`](auto.md) ×2

## Tests

`tests/snapshots/index.test.ts`. 3 other test files reference it.

## Budget

316 / 500 lines (184 to spare).
<!-- END GENERATED MAP FACTS -->

## What a snapshot is

A commit in the shadow repo (worktree content, `.gitignore` honored) plus a byte-copy of the
project's `.git/index`, with the pre-run HEAD sha and branch in the commit message.

All three parts are needed. The tree alone flattens staged and unstaged into one blob; the
index copy restores the split. The recorded HEAD is what lets `undo` roll a branch off a
commit a rogue `shell_exec` made.

## Restore sequence

```sh
git add -A                              # index must describe the post-disaster state...
git read-tree -u --reset <tree>         # ...or read-tree won't delete agent-created files
cp <saved>.index .git/index             # staged/unstaged split
git update-ref refs/heads/<branch> <sha>  # only if HEAD actually moved
```

## Guards are on what was recorded, not on what is true now

A project can gain or lose a `.git` mid-session, so the three cases are decided by the
snapshot, never by the current directory:

| Recorded | Now | Behavior |
| --- | --- | --- |
| no index | anything | worktree only; never write `.git/index` — it belongs to history the snapshot never saw |
| index | `.git` present | full restore |
| index | `.git` gone | worktree only, plus a warning that history was **not** recovered |

## Out of scope

Gitignored files never enter a snapshot and are never restored. That is what keeps snapshots
cheap, and user-facing output says so rather than implying total coverage.

## Cost

First snapshot in a project writes the whole tracked tree into a fresh object store — about
5s on this repo. Every session after that is ~1s: the shared index is reused as a stat cache,
so `add -A` re-hashes only what actually changed. Snapshots do not dedup against the user's
existing objects.

Ids are handed out synchronously and remembered per process, because the listing they are
checked against is stale the moment it is read — two snapshots issued in one tick would
otherwise pick the same id and the second `update-ref` would silently overwrite the first.
