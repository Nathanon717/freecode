/**
 * @role `freecode undo` — restores the project to the snapshot freecode took before an agent session's first write, lists the snapshots available, or shows what a restore would revert (`--diff`, `--semantic`). The snapshot library it drives is [../snapshots/index.md](../snapshots/index.md); the summary encoding is [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md).
 *
 * @readwhen
 * - Changing what `freecode undo` prints, its flags, or its exit codes.
 * - Debugging an undo that reported success but left the project wrong.
 * - Changing how a snapshot's changes are reviewed before deciding to restore.
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
  snapshotDiffPatch,
  snapshotDiffStat,
  type SnapshotMeta,
} from '../snapshots/index.js';
import { semanticDiff } from '../snapshots/semantic-diff.js';
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

interface UndoArgs {
  list: boolean;
  diff: boolean;
  semantic: boolean;
  /** `--list -n <count>`; undefined shows every snapshot. */
  limit?: number;
  id?: string;
}

/**
 * `-n` takes a value, so the snapshot id cannot be "the first token that is not
 * a flag": `undo --list -n 3` would read `3` as an id. Values are consumed
 * where they are introduced instead.
 *
 * Unrecognised flags are ignored rather than rejected, because argv here still
 * carries process-level flags that were never meant for `undo`. That is also
 * why `--semantic` implies `--diff`: with no flag it recognised, a typo'd
 * review command would fall through to *restoring* the project.
 */
function parseArgs(args: string[]): UndoArgs {
  const parsed: UndoArgs = { list: false, diff: false, semantic: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--list') parsed.list = true;
    else if (arg === '--diff') parsed.diff = true;
    else if (arg === '--semantic') parsed.semantic = parsed.diff = true;
    else if (arg === '-n') parsed.limit = Number(args[++i]);
    else if (!arg.startsWith('-')) parsed.id ??= arg;
  }
  return parsed;
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

  const options = parseArgs(args);
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    console.error('Error: -n takes a positive whole number of snapshots.');
    return 1;
  }

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

  if (options.list) {
    const shown = options.limit === undefined ? snapshots : snapshots.slice(0, options.limit);
    console.log(`Snapshots for ${projectRoot} (newest first):\n`);
    for (const [index, snapshot] of shown.entries()) {
      console.log(describe(snapshot, index));
      const stat = await safeDiffStat(projectRoot, snapshot.id);
      console.log(stat ? indent(stat) : '    (no changes since this snapshot)');
      console.log('');
    }
    const hidden = snapshots.length - shown.length;
    if (hidden > 0) console.log(`${hidden} older snapshot(s) not shown; raise \`-n\` to see them.\n`);
    console.log(`Inspect them by hand with:\n  ${inspectHint(projectRoot)}`);
    return 0;
  }

  const target = options.id ? snapshots.find((s) => s.id === options.id) : snapshots[0];
  if (!target) {
    console.error(`Error: no snapshot ${options.id}. Run \`freecode undo --list\` to see them.`);
    return 1;
  }

  if (options.diff) return reportDiff(projectRoot, target, options.semantic);

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
 * Prints what a restore of `target` would revert, and nothing else — the
 * snapshot is the baseline, so work that was already in the tree when it was
 * taken does not appear. That is the property `git diff` cannot offer, and the
 * reason this is a subcommand rather than an incantation in the docs.
 */
async function reportDiff(
  projectRoot: string,
  target: SnapshotMeta,
  semantic: boolean,
): Promise<number> {
  let patch: string;
  try {
    patch = await snapshotDiffPatch(projectRoot, target.id);
  } catch (error) {
    console.error(`Error reading snapshot ${target.id}: ${message(error)}`);
    return 1;
  }

  if (patch === '') {
    console.log(`No changes since snapshot ${target.id} (${target.takenAt || 'unknown time'}).`);
    return 0;
  }
  console.log(semantic ? semanticDiff(patch) : patch);
  return 0;
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
