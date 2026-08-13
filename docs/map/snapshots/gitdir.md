# src/snapshots/gitdir.ts - Git Directory Snapshots

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Captures and restores the project's own `.git` directory — the half of snapshot coverage a `git add` cannot reach — as a second work tree over the same shadow repo. What a snapshot covers otherwise is [coverage.md](coverage.md); the snapshot it hangs off is [index.md](index.md).

## Read When

- Debugging a revert that put files back but left config, hooks, refs, or the staged/unstaged split as the agent left them.
- Changing what is captured inside `.git`, or what `checkpoint diff` shows from it.
- A revert warned that the git directory could not be restored, or left it half-restored.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Commits the project's `.git` into the shadow repo and returns that commit, or
 * undefined when the project has no `.git` directory to capture.
 *
 * Cost is a file count, not bytes: ~3600 files and 12s cold on this repo, 0.1s
 * warm, and packfiles dedupe by content hash so a second snapshot stores only
 * what actually changed. Cold is paid once per project, on the first write of the
 * first delegated run.
 */
captureGitDir(shadowDir: string, projectRoot: string): Promise<string | undefined>

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
restoreGitDir(shadowDir: string, projectRoot: string, commit: string): Promise<void>

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
gitDirDiff(shadowDir: string, projectRoot: string, commit: string | undefined): Promise<string>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`snapshots/shadow-repo.ts`](shadow-repo.md) ×13, [`snapshots/coverage.ts`](coverage.md) ×4
- **Imported by:** [`snapshots/index.ts`](index.md) ×3

## Tests

`tests/snapshots/gitdir.test.ts`.

## Budget

170 / 500 lines (330 to spare).
<!-- END GENERATED MAP FACTS -->

## Why `.git` cannot just be added

Two things block the obvious approach, and both were verified rather than assumed:

- **`git add -f -- . .git` stages nothing of it.** Git skips any directory named `.git` during
  the worktree walk, and `-f` does not override that — it overrides *exclude files*, which is a
  different mechanism. This is also why [shadow-repo.md](shadow-repo.md) no longer writes an
  `info/exclude` holding `/.git/`: it was never what kept it out.
- **The tree cannot be grafted in under its own name either.** `read-tree --prefix=.git/` fails
  with `invalid path '.git/config'` — git's `verify_path` refuses index entries under a `.git`
  component, precisely so a hostile tree cannot write one.

So `.git` is captured as a **second work tree**: the same shadow repo driven with
`--work-tree=<project>/.git`, producing a tree whose paths are relative to `.git` itself
(`config`, `hooks/pre-commit`, `refs/heads/main`).

## How it hangs off a snapshot

The `.git` commit is recorded as the **parent** of the snapshot commit in [index.md](index.md).
That is not a claim about history — snapshot commits are never chained to each other, so the only
parent a snapshot can have is its `.git` capture, which is how `listSnapshots` reads it back out
of `%(parent)`.

It is a parent rather than a sha in the commit message because a parent is *reachable*: the one
ref already protecting the snapshot protects this too, so `pruneSnapshots` deletes both with the
ref it already deletes and no second namespace has to be kept in step. A sha mentioned only in a
message would be unreferenced the moment it was written.

## What this closes, and what it does not

Finding A3 in [../../agent-containment-audit.md](../../agent-containment-audit.md): `git config
core.hooksPath` pointed git at a directory of the agent's choosing, so the next `git commit` ran
the agent's code — and it survived `checkpoint revert` and never appeared in `checkpoint diff`.
Branch deletion and `reflog expire && gc --prune=now` were equally unrecoverable; both come back
now, which the acceptance script demonstrates against a repo it has just pruned.

Two things it deliberately does not do:

- **It does not make a planted hook harmless, only reversible.** The hook still executes during
  the agent's own session — the agent runs `git commit` itself, and `gc --auto` fires unprompted.
  Prevention is containment's job, which is why the regex guards in
  [../agent/tools/git-guard.md](../agent/tools/git-guard.md) stay until C5.
- **It does not reach `git config --global`.** `core.hooksPath` set in the user's home directory
  is outside the project and outside any project snapshot. That half of A3 waits on C4.

## Restoring, and the failure that matters

Restore is one `read-tree -u --reset` over the same second work tree, run *after* the project's
files — `.git` holds the index describing them, so restoring it first and then failing on the
worktree would leave the two disagreeing. It recreates `.git` when the agent deleted it outright;
that case used to be a warning saying history was gone for good.

Locked files split into two cases, and the difference is the whole reason this throws:

| git must | Outcome | Example |
| --- | --- | --- |
| **delete** a file it cannot | `warning:`, exit 0, restore completes | a packfile a git GUI holds open |
| **replace** a file it cannot | `error:`, exit 128, restore aborts mid-write | `.git/index` under an editor |

The second leaves refs rolled back with a stale index, and `git fsck` then reports a broken
cache-tree — a state that is neither the snapshot nor what the agent produced.

The worktree half ([locked-files.md](locked-files.md)) tolerates both rows and names the paths,
which is not available here. It can say "everything except `dev.db` is back" because that is a
true and useful description of a project; "everything except `refs/heads/main`" is not a
description of a git directory. So this half keeps the weaker promise — run it again — and the
first row's `warning:`/exit-0 case is genuinely harmless here for a reason that does not transfer
either: an extra packfile is content-addressed and inert, where an undeleted worktree file is the
agent's payload.

What saves it is that `read-tree -u --reset` is **idempotent**. Running the same revert again once
the holder lets go was verified to repair the state completely, `fsck` clean and the
staged/unstaged split intact, so [index.md](index.md) catches the failure, keeps the worktree
restore, and the warning it produces says exactly that.

[../cli/checkpoint.md](../cli/checkpoint.md) then treats it as a **failed revert**: exit 1, and the
review lock stays held. That is not a formality — the lock is what keeps a repeated
`checkpoint revert` aimed at the same snapshot, so releasing it would take away the repair the
warning just recommended, on top of marking a broken `.git` as reviewed.

## Cost

Measured on this repo (19 MB `.git`, ~3600 files): **12s cold, 0.1s warm**, and the store grows by
about the size of `.git` once. Cold is file count rather than bytes and is paid once per project,
on the first write of the first delegated run — which now costs roughly 24s in total, against
11.8s before. Packfiles dedupe by content hash, so later snapshots store only what changed; a
`git gc` in the project between two snapshots is the one operation that writes a whole new pack.

The stat cache lives in its own index (`freecode-index/gitdir.index`), separate from the project's.
Seeding one walk from the other's cache would match no stat data and silently pay the cold cost
every single time — the reason `withScratchIndex` in [shadow-repo.md](shadow-repo.md) takes the
cache to seed from as a parameter.

## Why the diff shows only `config` and `hooks/`

Those two are the whole RCE surface the finding is about, and they are small, textual, and stable.
Refs, logs, and objects churn on every git command the agent runs; a diff nobody can read is not
review coverage. The consequence is worth stating plainly: **a branch deletion is recovered by a
revert without being shown by the diff.**
