/**
 * @role What a snapshot covers: the one `git add` that take, diff and restore all stage with, the directories left out of it, and the list a revert prints of what it therefore left alone. Split from [index.md](index.md) at the line limit.
 *
 * @readwhen
 * - Changing which files a snapshot covers, or adding an exclusion — every operation in [index.md](index.md) stages through `stagingArgs`, and they must not diverge.
 * - A revert deleted, restored, or skipped a file someone did not expect.
 */

// Coverage is **every file under the project root except the excluded directory
// names** — gitignored files included, which is what closes finding A2 (a payload
// in `dist/` was invisible to `checkpoint diff` *and* survived `checkpoint revert`,
// needing no `.gitignore` edit in any normal JS project) — **plus the project's own
// `.git`**, which git's worktree walk always skips and which is therefore staged
// separately, by `gitDirStagingArgs` here and the second work tree in
// snapshots/gitdir.ts.
//
// Two consequences of that width, both real:
//
//  - A revert deletes and restores ignored files. Build output and local databases
//    are inside the blast radius where they used to be outside it, and a file the
//    OS will not let git rewrite comes back as a named path rather than a restored
//    one (snapshots/locked-files.ts).
//  - Their contents enter the shadow repo, which never runs `git gc` (C13 in
//    docs/agent-containment-audit.md), so a `.env` captured once persists there in
//    plaintext.

import { readdirSync, type Dirent } from 'fs';
import { join } from 'path';

/**
 * Directory names left out of every snapshot, matched at any depth.
 *
 * `node_modules` is excluded by *prevention* rather than backup: it is mounted
 * read-only under the containment work (C3 in docs/agent-containment-plan.md), so
 * there is nothing to hide in it and nothing worth copying — 316 MB on this repo,
 * against 4 MB for everything else ignored.
 *
 * `.freecode` is freecode's own state directory — the live SQLite store, its `-wal`
 * and `-shm` — and it sits inside the project whenever freecode runs from source
 * there. Restoring it is not "putting the project back", and it does not merely
 * risk a stale database: `read-tree -u` **fails outright** on Windows because the
 * running process holds those files, which aborts the revert part-way through.
 * Demonstrated with a live libsql connection. The same hazard exists for any live
 * database inside coverage — a user's own `dev.db` held open by their dev server —
 * and no exclusion list can enumerate those, which is why the restore reports them
 * by name instead (snapshots/locked-files.ts).
 */
const DEFAULT_EXCLUDED_DIRS = ['node_modules', '.freecode'];

/**
 * `FREECODE_SNAPSHOT_EXCLUDE` replaces the list, comma-separated, empty for none.
 *
 * An env var rather than a `config.json` key on purpose: `loadConfig()` reads the
 * DB cache, and `freecode checkpoint` runs deliberately before the store loads
 * (see cli/checkpoint.ts). A two-entry list is not worth putting the store on that
 * path, and snapshots are already configured this way (`FREECODE_SNAPSHOT_DIR`).
 */
function excludedDirs(): string[] {
  const override = process.env['FREECODE_SNAPSHOT_EXCLUDE'];
  if (override === undefined) return DEFAULT_EXCLUDED_DIRS;
  return override
    .split(',')
    .map((name) => name.trim().replace(/[/\\]+$/, ''))
    .filter((name) => name !== '');
}

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
export function stagingArgs(): string[] {
  return [
    'add',
    '-A',
    '-f',
    '--',
    '.',
    ...excludedDirs().map((name) => `:(exclude,glob)**/${name}/**`),
  ];
}

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
export function gitDirStagingArgs(): string[] {
  return ['add', '-A', '-f', '--', '.', ':(exclude,glob)**/*.lock'];
}

/**
 * The paths inside `.git` that `checkpoint diff` reports on — the RCE surface of
 * finding A3 and nothing else. Kept beside `stagingArgs` because it is the same
 * question ("what does a review see?") answered for the other work tree; the
 * reasoning for the narrowness is on `gitDirDiff` in snapshots/gitdir.ts.
 */
export function gitDirDiffPaths(): string[] {
  return ['config', 'hooks'];
}

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
export function listExcludedPaths(projectRoot: string, limit = 20): string[] {
  const names = new Set(excludedDirs());
  if (names.size === 0) return [];
  const found: string[] = [];

  const walk = (dir: string, prefix: string): void => {
    if (found.length >= limit) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      // Unreadable mid-walk: a directory nobody can list holds nothing this revert
      // could have touched either.
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git') continue;
      const relative = `${prefix}${entry.name}`;
      if (names.has(entry.name)) {
        found.push(`${relative}/`);
        if (found.length >= limit) return;
        continue;
      }
      walk(join(dir, entry.name), `${relative}/`);
    }
  };

  walk(projectRoot, '');
  return found;
}
