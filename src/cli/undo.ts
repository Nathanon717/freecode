/**
 * @role `freecode undo` — restores the project to the snapshot freecode took before an agent session's first write, or lists the snapshots available. The snapshot library it drives is [../snapshots/index.md](../snapshots/index.md).
 *
 * @readwhen
 * - Changing what `freecode undo` prints, its flags, or its exit codes.
 * - Debugging an undo that reported success but left the project wrong.
 */

// Runs before the heavy module graph loads (see src/index.ts): undo is git and
// nothing else, so it must not pay for the ai SDK or the store to tell someone
// their files are recoverable.

import { existsSync } from 'fs';
import { dirname, join, relative, isAbsolute, resolve } from 'path';
import {
  inspectHint,
  listSnapshots,
  restoreSnapshot,
  snapshotDiffStat,
  type SnapshotMeta,
} from '../snapshots/index.js';
import {
  gitAvailable,
  listShadowProjects,
  runProjectGit,
  shadowRepoExists,
} from '../snapshots/shadow-repo.js';

export interface UndoOptions {
  projectRoot: string;
  /** Remaining argv after the `undo` verb. */
  args: string[];
}

function describe(snapshot: SnapshotMeta, index: number): string {
  const when = snapshot.takenAt || '(unknown time)';
  const branch = snapshot.branch ? ` on ${snapshot.branch}` : '';
  const head = snapshot.head ? ` at ${snapshot.head.slice(0, 8)}` : '';
  return `${index === 0 ? '*' : ' '} ${snapshot.id}  ${when}${branch}${head}`;
}

function isUnder(ancestor: string, candidate: string): boolean {
  const rel = relative(ancestor, candidate);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Snapshots are keyed on the directory freecode was launched from, and someone
 * reaching for `undo` is rarely standing in it — they are two levels down in
 * `src/` and something just went wrong. Walk up until a shadow repo turns up,
 * bounded by the enclosing repo so this can never reach into a parent project.
 */
async function resolveUndoRoot(startDir: string): Promise<string | undefined> {
  let ceiling = startDir;
  try {
    ceiling = (await runProjectGit(startDir, ['rev-parse', '--show-toplevel'])).trim() || startDir;
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

/** Returns the process exit code. */
export async function runUndo({ projectRoot: startDir, args }: UndoOptions): Promise<number> {
  if (!(await gitAvailable())) {
    console.error('Error: undo needs a `git` binary on PATH, and none was found.');
    return 1;
  }

  const wantsList = args.includes('--list');
  const idArg = args.find((arg) => !arg.startsWith('-'));

  const projectRoot = await resolveUndoRoot(startDir);
  if (!projectRoot) return reportNoSnapshots(startDir);
  if (projectRoot !== resolve(startDir)) console.log(`Using snapshots for ${projectRoot}.\n`);

  let snapshots: SnapshotMeta[];
  try {
    snapshots = await listSnapshots(projectRoot);
  } catch (error) {
    console.error(`Error reading snapshots: ${message(error)}`);
    return 1;
  }

  if (snapshots.length === 0) return reportNoSnapshots(projectRoot);

  if (wantsList) {
    console.log(`Snapshots for ${projectRoot} (newest first):\n`);
    for (const [index, snapshot] of snapshots.entries()) {
      console.log(describe(snapshot, index));
      const stat = await safeDiffStat(projectRoot, snapshot.id);
      console.log(stat ? indent(stat) : '    (no changes since this snapshot)');
      console.log('');
    }
    console.log(`Inspect them by hand with:\n  ${inspectHint(projectRoot)}`);
    return 0;
  }

  const target = idArg ? snapshots.find((s) => s.id === idArg) : snapshots[0];
  if (!target) {
    console.error(`Error: no snapshot ${idArg}. Run \`freecode undo --list\` to see them.`);
    return 1;
  }

  try {
    const outcome = await restoreSnapshot(projectRoot, target.id);
    console.log(`Restored ${projectRoot} to snapshot ${target.id} (${target.takenAt || 'unknown time'}).`);
    if (outcome.indexRestored) console.log('Staged/unstaged split restored from the saved index.');
    if (outcome.headRestored) console.log(`Branch ${target.branch} rolled back to ${target.head?.slice(0, 8)}.`);
    for (const warning of outcome.warnings) console.log(`\nWarning: ${warning}`);
    // Gitignored files never enter a snapshot, so they were never restored
    // either. Say so rather than implying total coverage.
    if (existsSync(join(projectRoot, '.gitignore'))) {
      console.log('\nNote: files ignored by .gitignore are outside snapshot coverage and were left as they are.');
    }
    return 0;
  } catch (error) {
    console.error(`Error restoring snapshot: ${message(error)}`);
    return 1;
  }
}

/**
 * Always exit 0: having nothing to undo is not a failure. But a shadow repo for
 * a *nearby* directory almost always means freecode was launched from there,
 * and "no snapshots" would be a wrong answer to the question actually being
 * asked — so name those directories rather than leave someone to guess.
 */
function reportNoSnapshots(projectRoot: string): number {
  console.log(
    `No snapshots for this project (${projectRoot}). freecode takes one before an agent session's first write.`,
  );
  const nearby = listShadowProjects().filter((path) => isUnder(resolve(projectRoot), path));
  if (nearby.length > 0) {
    console.log('\nSnapshots do exist for:');
    for (const path of nearby) console.log(`  ${path}`);
    console.log('\nRun `freecode undo` from one of those directories.');
  }
  return 0;
}

async function safeDiffStat(projectRoot: string, id: string): Promise<string> {
  try {
    return await snapshotDiffStat(projectRoot, id);
  } catch {
    return '';
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
