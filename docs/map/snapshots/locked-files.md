# src/snapshots/locked-files.ts - Locked Files On Restore

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Puts the project's files back, turning a path another process is holding open into a named warning instead of a thrown error or — worse — silence. The restore it serves is [index.md](index.md); what it stages is [coverage.md](coverage.md).

## Read When

- A `checkpoint revert` reported success while one of the agent's files was still on disk, or failed with nothing but git's own error text.
- Changing how the worktree half of a restore runs, or what a revert says about paths it could not write.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
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
restoreWorktree(shadowDir: string, projectRoot: string, ref: string): Promise<string[]>

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
lockedFilesWarning(paths: string[]): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/shadow-repo.ts`](shadow-repo.md) ×3, [`snapshots/coverage.ts`](coverage.md) ×1
- **Imported by:** [`snapshots/index.ts`](index.md) ×2

## Tests

`tests/snapshots/locked-files.test.ts`.

## Budget

129 / 500 lines (371 to spare).
<!-- END GENERATED MAP FACTS -->

## Why this module exists at all

Before ignored files entered snapshot coverage ([coverage.md](coverage.md)), a file the OS would
not let git rewrite was a rarity — the things a running process holds open are databases and
caches, and those were all outside the snapshot. R2 put them inside it. A revert now deletes and
restores `dist/`, `.env`, and whatever `dev.db` the user's dev server has open, which makes "git
could not write this path" an ordinary event rather than an exotic one.

`.freecode` is excluded by name because freecode's own live SQLite store broke reverts in this
repo's dev setup outright. A user's own database cannot be enumerated that way, and that residual
is exactly what this module handles.

## The measured fact everything here rests on

**`read-tree -u --reset` is not all-or-nothing.** Held against a file locked the way SQLite locks
one — `FILE_SHARE_READ`, so it is readable but neither replaceable nor deletable — git:

- restores every other path, including ones sorting *after* the locked one,
- performs the deletions it was going to perform,
- and then reports what it could not touch.

So there is nothing to retry and nothing to exclude: **the restore already happened.** The only
thing missing was that nobody heard about it.

This retires the shape the plan originally proposed for R5 ("re-run the restore with those paths
excluded from the pathspec"), which was not available anyway: `read-tree` takes tree-ish
arguments, not a pathspec. `read-tree -u --reset HEAD -- a.txt` dies with
`fatal: Not a valid object name a.txt`, reading the path as a second tree.

## Two failure shapes, and the dangerous one is silent

| git must | git says | exit | what it meant before this module |
| --- | --- | --- | --- |
| **replace** a file it cannot | `error: unable to unlink old '<path>':` | 128 | `restoreSnapshot` threw; `checkpoint revert` printed `Error reverting snapshot:` and named nothing, despite the rest of the tree being back |
| **delete** a file it cannot | `warning: unable to unlink '<path>':` | 0 | **nothing at all** — the agent's file stayed on disk and the revert reported complete success |

The second row is the worse bug and the one the plan did not know about. It is agent-created
content surviving `checkpoint revert`, which is the class of failure the whole containment plan
exists to close, and `runGit` in [shadow-repo.md](shadow-repo.md) discarded stderr on a zero exit
— hence `runShadowGitCapturing`, which exists for this one caller.

## Why the tolerance is narrow

Only a failure whose every `error:`/`fatal:` line is one of those unlinks is swallowed; anything
else rethrows. A missing ref, a full disk, or a shape nobody has measured has *not* been shown to
leave the rest of the tree restored, and "everything else is back" would be a guess about it. The
same narrowness, for the same reason, as `isObjectWriteCollision` in
[shadow-repo.md](shadow-repo.md).

`fatal: updating files failed` is allowed through as the summary line `read-tree` exits on once an
entry has failed — it is the terminator, not a second fault.

## A locked path is a failed revert

[../cli/checkpoint.md](../cli/checkpoint.md) exits 1 and keeps the review lock, the same as it does
for a `.git` that would not go back ([gitdir.md](gitdir.md)). The plan's sketch had these come back
as ordinary warnings on an exit-0 revert, and that is wrong for the same reason it was wrong one
layer up: those paths still hold the agent's content, so releasing the lock would mark unreverted
work as reviewed and admit the next delegated run against it.

Both ways out are named in the warning, because only one of them ever finishes:

- **Run the revert again.** `read-tree -u --reset` is idempotent, so once a *transient* holder — an
  editor, a stray `git` — lets go, repeating the command completes the job. Verified.
- **`checkpoint accept`.** A dev server holds its database for as long as it runs, so "try again"
  never converges there. The paths are the user's own, and accepting is the honest end of a review
  whose remaining delta is a file they own.

The `.git` half answers the question [gitdir.md](gitdir.md) leaves open differently, and on
purpose: there, excluding the failed path is impossible ("everything except `refs/heads/main`" is
not a git directory), so "run it again" is the only advice available. Here the paths can be named
exactly, so they are.

## Testing this

`tests/snapshots/locked-files.test.ts` takes a real lock, with PowerShell holding the file at
`FileShare.Read`. Those cases are Windows-only and say so. There is no portable substitute: POSIX
advisory locks do not stop `unlink` at all, and the read-only-parent-directory trick that would is
a different failure with different wording from git. The behaviour under test is a Windows one.

Note the share mode matters. `FileShare.None` blocks reading, which fails the `add -A` staging step
*before* the restore, and is a different (harder) failure this module does not claim to handle.
