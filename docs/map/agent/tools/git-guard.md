# src/agent/tools/git-guard.ts - Git Internals Guard

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Hard block on writes and deletes targeting a project's `.git` directory, used by `create`, `edit`, and `shell_exec`.

## Read When

- Changing what counts as touching git internals, or adding a mutating command shape the shell guard should catch.
- Debugging a legitimate command refused as a `.git` write, or a `.gitignore`/`.github` path wrongly caught.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * True when a relative project path points inside `.git`.
 *
 * Case-insensitive because on Windows and macOS the filesystem is:
 * `.GIT/hooks/pre-commit` opens the real `.git/hooks/pre-commit` there, so an
 * exact-match comparison refused the lowercase spelling and wrote the hook for
 * the uppercase one. On Linux `.GIT` is a genuinely different directory and
 * refusing it is a false positive — an acceptable one, since nothing legitimate
 * writes to a path spelled that way.
 */
isGitInternalPath(relativePath: string): boolean

/**
 * True when a shell command would write to or delete something under `.git`.
 */
shellTouchesGitInternals(command: string): boolean

/**
 * The single refusal wording, so every guarded tool reports the block the same way.
 */
GIT_INTERNALS_REFUSAL: string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`agent/tools/create.ts`](create.md) ×2, [`agent/tools/edit.ts`](edit.md) ×2, [`agent/tools/shell.ts`](shell.md) ×2

## Tests

`tests/agent/tools/git-guard.test.ts`.

## Budget

78 / 500 lines (422 to spare).
<!-- END GENERATED MAP FACTS -->

## Why this is a hard block

Snapshots recover working files from a shadow repo outside the project, so deleting files is
covered. Deleting the project's `.git` is not: files come back, commit history does not.
The gap is closed by prevention.

Not model-confirmable, deliberately. `shell_exec`'s `confirmDestructive` is a parameter the
*model* sets, and under `freecode -p --edit` ask mode is `auto` — a flag here would be worth
nothing. For that reason the caller ([`shell.ts`](shell.md)) runs `shellTouchesGitInternals`
and returns the refusal *before* it reaches the confirmable `isDestructiveCommand` branch.

## What it does and does not catch

- Paths: any segment equal to `.git`, compared case-insensitively — Windows and macOS open
  `.GIT/hooks/pre-commit` as the real hook, so a byte comparison refused one spelling and
  permitted the other. `.gitignore`, `.gitattributes`, `.gitmodules` and `.github` are
  ordinary project files and pass.
- Shell: fires where a `.git` reference and a mutating verb meet, or where a redirect's
  *target* is inside `.git`. `cat .git/HEAD` is a read and passes; `rm -rf .git`, `mv .git …`,
  and `echo … > .git/HEAD` do not.
- The redirect rule is deliberately on the target, not on `>` anywhere in the command. The
  standard way to skip a repo's internals is to name them —
  `grep -r --exclude-dir=.git foo . > out.txt` — and refusing that would block commands whose
  whole point is to leave `.git` alone. Both exclude idioms are in the test table.

## What it cannot catch

This is a denylist over an unbounded shell, so read it as raising the cost of an accident, not
as `.git` being protected. The whole class it misses is **git mutating its own internals
without the string `.git` appearing anywhere**: `git config core.hooksPath …` installs a hook
that survives a revert, and `git reflog expire`, `gc --prune=now`, and `branch -D` destroy
history the same way. No regex over shell text closes that. What closes it is snapshotting
`.git` itself and running the agent in a container — until then, treat the guard as a
speed bump.
