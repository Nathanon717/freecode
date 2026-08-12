/**
 * @role Hard block on writes and deletes targeting a project's `.git` directory, used by `create`, `edit`, and `shell_exec`.
 *
 * @readwhen
 * - Changing what counts as touching git internals, or adding a mutating command shape the shell guard should catch.
 * - Debugging a legitimate command refused as a `.git` write, or a `.gitignore`/`.github` path wrongly caught.
 */

// Checkpoint snapshots recover working files from a shadow repo outside the project,
// so deleting files is fully covered. Deleting the project's `.git` is not:
// files come back, but commit history, branches, and reflog do not, because the
// shadow repo stores worktree content plus an index copy, not the user's object
// store. That gap is closed by prevention rather than backup.
//
// This block is not model-confirmable. `shell_exec`'s `confirmDestructive` is a
// parameter the *model* sets, and under `freecode -p --edit` ask mode is `auto`,
// so nothing else intercepts — a flag here would be worth nothing.

/**
 * `.git` as a whole path segment. The negative lookahead is what keeps
 * `.gitignore`, `.gitattributes`, `.gitmodules`, and `.github` out of it — those
 * are ordinary project files an agent has every reason to write.
 */
const GIT_INTERNALS = /(?:^|[\s'"=`(/\\])\.git(?![\w-])/;

/**
 * A redirect whose *target* is inside `.git`. Kept separate from the verbs below
 * because a bare `>` anywhere in the command is not evidence of anything: the
 * standard way to skip a repo's internals is to name them
 * (`grep -r --exclude-dir=.git foo . > out.txt`), and refusing that would block
 * commands whose whole point is to leave `.git` alone.
 */
const REDIRECT_INTO_GIT = /(?:^|[^0-9<>])>>?\s*['"]?[^\s'"|;&]*\.git(?![\w-])/;

/**
 * Command shapes that write. A command merely *mentioning* `.git` is usually a
 * read (`cat .git/HEAD`), and refusing those would break ordinary inspection —
 * so the guard fires only where a mutation and a `.git` reference meet.
 */
const MUTATING = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bunlink\b/i,
  /\bdel\b/i,
  /\bmv\b/i,
  /\bmove\b/i,
  /\bcp\b/i,
  /\bremove-item\b/i,
  /\bmove-item\b/i,
  /\bcopy-item\b/i,
  /\bset-content\b/i,
  /\bnew-item\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bchmod\b/i,
  /\bshred\b/i,
];

/** True when a relative project path points inside `.git`. */
export function isGitInternalPath(relativePath: string): boolean {
  return relativePath
    .split(/[/\\]/)
    .some((segment) => segment === '.git');
}

/** True when a shell command would write to or delete something under `.git`. */
export function shellTouchesGitInternals(command: string): boolean {
  if (REDIRECT_INTO_GIT.test(command)) return true;
  if (!GIT_INTERNALS.test(command)) return false;
  return MUTATING.some((pattern) => pattern.test(command));
}

/** The single refusal wording, so every guarded tool reports the block the same way. */
export const GIT_INTERNALS_REFUSAL =
  "Refused: writing to or deleting the project's .git directory is blocked. " +
  'Checkpoint snapshots cannot recover commit history, so freecode does not allow it — ' +
  'use ordinary git commands (git reset, git checkout, git branch -d) instead.';
