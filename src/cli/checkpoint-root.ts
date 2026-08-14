/**
 * @role Locates the project whose snapshots a `freecode checkpoint` command should use when invoked from elsewhere in or above the project. Kept separate from [checkpoint.md](checkpoint.md), which owns the command surface and review actions.
 *
 * @readwhen
 * - A checkpoint command run from a project subdirectory cannot find snapshots or restores from the wrong store.
 * - Changing how checkpoint discovery is bounded or how nearby snapshot projects are classified.
 */

import { dirname, isAbsolute, relative, resolve } from 'path';
import { runProjectGit, shadowRepoExists } from '../snapshots/shadow-repo.js';

export function isUnder(ancestor: string, candidate: string): boolean {
  const rel = relative(ancestor, candidate);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Walks up from `startDir` until a shadow repo turns up, bounded by the
 * enclosing repository so discovery cannot enter a parent project.
 *
 * Git's relative route back to the top is deliberate: `--show-toplevel`
 * expands an 8.3 Windows path to its long spelling. The snapshot store is keyed
 * by the caller's spelling, so that canonicalisation makes the real root look
 * unrelated and impossible to find.
 */
export async function resolveSnapshotRoot(startDir: string): Promise<string | undefined> {
  let ceiling = startDir;
  try {
    const cdup = (await runProjectGit(startDir, ['rev-parse', '--show-cdup'])).trim();
    ceiling = resolve(startDir, cdup || '.');
  } catch {
    // Not a git repo: the launch directory is the only candidate worth trusting.
  }

  let current = resolve(startDir);
  for (;;) {
    if (shadowRepoExists(current)) return current;
    const parent = dirname(current);
    if (parent === current || !isUnder(resolve(ceiling), current)) return undefined;
    current = parent;
  }
}
