/**
 * @role `freecode checkpoint` — the review surface over the snapshot taken before a session's first write: `list` what exists, `diff` what changed, then `revert` it or `accept` it as the new baseline. Drives [../snapshots/index.md](../snapshots/index.md), prints [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md), and frees [../snapshots/review-lock.md](../snapshots/review-lock.md).
 *
 * @readwhen
 * - Changing what `freecode checkpoint` prints, its subcommands, its flags, or its exit codes.
 * - Debugging a revert that reported success but left the project wrong.
 * - Changing how a delegated change is reviewed, or what frees the project for the next one.
 */

// Runs before the heavy module graph loads (see src/index.ts): this is git and
// nothing else, so it must not pay for the ai SDK or the store to tell someone
// their files are recoverable.
//
// The verb, not a flag, carries the intent. `undo` was one command whose default
// action was destructive, so a mistyped review flag fell through to *restoring*
// the project; here the only way to reach `revert` is to type it.

import { existsSync } from 'fs';
import { dirname, join, relative, isAbsolute, resolve } from 'path';
import { processFlag } from './args.js';
import {
  inspectHint,
  listSnapshots,
  restoreSnapshot,
  snapshotDiffPatch,
  snapshotDiffStat,
  takeSnapshot,
  type SnapshotMeta,
} from '../snapshots/index.js';
import { readReviewLock, releaseReviewLock } from '../snapshots/review-lock.js';
import { semanticDiff } from '../snapshots/semantic-diff.js';
import {
  gitAvailable,
  listShadowProjects,
  runProjectGit,
  shadowRepoExists,
} from '../snapshots/shadow-repo.js';

export interface CheckpointOptions {
  projectRoot: string;
  /** Remaining argv after the `checkpoint` verb. */
  args: string[];
}

const VERBS = ['list', 'diff', 'revert', 'accept'] as const;
type Verb = (typeof VERBS)[number];
const VERB_LIST = VERBS.join(', ');

interface CheckpointArgs {
  verb: Verb;
  /** `list -n <count>`; undefined shows every snapshot. */
  limit?: number;
  /** `diff --patch` — the full unified patch instead of the default summary. */
  patch: boolean;
  id?: string;
}

function isVerb(token: string): token is Verb {
  return (VERBS as readonly string[]).includes(token);
}

/**
 * Strict, like the process argv walk in [args.md](args.md): every token is either
 * accounted for or named in an error. The tolerant parse this replaces existed
 * because a single `undo` command could not tell a flag meant for it from one
 * meant for the process — a subcommand removes that ambiguity, so silence is no
 * longer the safe answer.
 *
 * The one concession: this is dispatched off raw argv before the process-level
 * walk runs, so argv still carries flags aimed at the process (`-log`, and the
 * `--script` the e2e harness appends). Those are skipped — their value too, when
 * they take one — on the authority of the same table that defines them, never a
 * second copy of it.
 */
function parseArgs(args: string[]): CheckpointArgs | { error: string } {
  let verb: Verb = 'list';
  let rest = args;
  const [head] = args;
  if (head !== undefined && !head.startsWith('-')) {
    if (!isVerb(head)) {
      return { error: `Unknown subcommand: ${head}. Valid subcommands: ${VERB_LIST}` };
    }
    verb = head;
    rest = args.slice(1);
  }

  const parsed: CheckpointArgs = { verb, patch: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const process_ = processFlag(arg);
    if (process_) {
      if (process_.takesValue) i++;
      continue;
    }
    if (arg === '-n') {
      if (verb !== 'list') return { error: `-n applies to \`checkpoint list\`, not \`checkpoint ${verb}\`.` };
      const value = rest[++i];
      if (value === undefined) return { error: '-n requires a count: checkpoint list -n <count>' };
      parsed.limit = Number(value);
    } else if (arg === '--patch') {
      if (verb !== 'diff') return { error: `--patch applies to \`checkpoint diff\`, not \`checkpoint ${verb}\`.` };
      parsed.patch = true;
    } else if (arg.startsWith('-')) {
      return { error: `Unknown flag: ${arg}. Run \`freecode checkpoint list\` to see what exists.` };
    } else if (verb === 'list' || verb === 'accept') {
      // `accept` is always about the state in front of you — there is no such
      // thing as accepting an older snapshot, only reverting to one.
      return { error: `Unexpected argument: ${JSON.stringify(arg)}. \`checkpoint ${verb}\` takes no id.` };
    } else if (parsed.id !== undefined) {
      return { error: `Unexpected argument: ${JSON.stringify(arg)}. \`checkpoint ${verb}\` takes one id.` };
    } else {
      parsed.id = arg;
    }
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
 * reaching for a checkpoint is rarely standing in it — they are two levels down
 * in `src/` and something just went wrong. Walk up until a shadow repo turns up,
 * bounded by the enclosing repo so this can never reach into a parent project.
 */
async function resolveSnapshotRoot(startDir: string): Promise<string | undefined> {
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
export async function runCheckpoint({ projectRoot: startDir, args }: CheckpointOptions): Promise<number> {
  if (!(await gitAvailable())) {
    console.error('Error: checkpoint needs a `git` binary on PATH, and none was found.');
    return 1;
  }

  const options = parseArgs(args);
  if ('error' in options) {
    console.error(`Error: ${options.error}`);
    return 1;
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    console.error('Error: -n takes a positive whole number of snapshots.');
    return 1;
  }

  const projectRoot = await resolveSnapshotRoot(startDir);
  // `accept` is the one verb that works with nothing snapshotted: it *takes* a
  // snapshot, and it is also the way out of a review lock left behind by a run
  // whose own snapshot never happened.
  if (options.verb === 'accept') return accept(projectRoot ?? resolve(startDir));
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
  if (options.verb === 'list') return reportList(projectRoot, snapshots, options.limit);

  const target = options.id
    ? snapshots.find((s) => s.id === options.id)
    : outstanding(projectRoot, snapshots);
  if (!target) {
    console.error(`Error: no snapshot ${options.id}. Run \`freecode checkpoint list\` to see them.`);
    return 1;
  }
  if (!options.id && target !== snapshots[0]) {
    console.log(`Reviewing everything since the delegated run began (snapshot ${target.id}).\n`);
  }

  if (options.verb === 'diff') return reportDiff(projectRoot, target, options.patch);
  return revert(projectRoot, target);
}

/**
 * Which snapshot a bare `diff` or `revert` means.
 *
 * Not simply the newest. Only *delegated* runs are serialised by the review
 * lock — an interactive or `--script` session still snapshots itself before its
 * own first write, so one starting up between a delegation and its review makes
 * the newest snapshot a point *after* the agent's work. Reviewing against that
 * one hides the change entirely, and reverting to it would keep the unreviewed
 * work while reporting success.
 *
 * So while a claim is outstanding, the target is the oldest snapshot taken since
 * it was made — the delegated run's own. Anything that landed on top is then
 * shown rather than hidden, which is the right way round: an edit the reviewer
 * did not expect is exactly what they need to see. With no lock held, or none of
 * the snapshots new enough to be the run's (it was killed before taking one),
 * this is the newest, which is what it always was.
 */
function outstanding(projectRoot: string, snapshots: SnapshotMeta[]): SnapshotMeta {
  const held = readReviewLock(projectRoot);
  if (!held?.startedAt) return snapshots[0];
  // Both are `toISOString()` output, so lexicographic order is chronological.
  const since = snapshots.filter((s) => s.takenAt && s.takenAt >= held.startedAt);
  return since.at(-1) ?? snapshots[0];
}

async function reportList(
  projectRoot: string,
  snapshots: SnapshotMeta[],
  limit: number | undefined,
): Promise<number> {
  const shown = limit === undefined ? snapshots : snapshots.slice(0, limit);
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

/**
 * Prints what a revert of `target` would undo, and nothing else — the snapshot
 * is the baseline, so work that was already in the tree when it was taken does
 * not appear. That is the property `git diff` cannot offer, and the reason this
 * is a subcommand rather than an incantation in the docs.
 *
 * The summary is the default because the reader this is written for is a lead
 * agent holding the whole change in a context window it is also using to work.
 * `--patch` is there for the times the summary is not enough.
 */
async function reportDiff(
  projectRoot: string,
  target: SnapshotMeta,
  patchMode: boolean,
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
  console.log(patchMode ? patch : semanticDiff(patch));
  return 0;
}

/**
 * Marks the project as reviewed: a fresh snapshot becomes the baseline the next
 * delegated run is measured against, and the review lock is freed.
 *
 * The snapshot is the point, not a side effect. Without one, "accepted" would be
 * a state nothing recorded — the newest snapshot would still be the *pre*-agent
 * one, so a later `revert` would throw away the work that was just approved
 * along with whatever came after it.
 */
async function accept(projectRoot: string): Promise<number> {
  let meta: SnapshotMeta;
  try {
    meta = await takeSnapshot(projectRoot);
  } catch (error) {
    console.error(`Error taking the accepted snapshot: ${message(error)}`);
    return 1;
  }
  // After the snapshot: a lock released without a baseline to show for it would
  // let the next run start against a state nobody can get back to.
  releaseReviewLock(projectRoot);
  console.log(`Accepted. ${projectRoot} is the baseline as of snapshot ${meta.id}.`);
  console.log('The next `-p --edit` run is measured against it, and may now start.');
  return 0;
}

async function revert(projectRoot: string, target: SnapshotMeta): Promise<number> {
  try {
    const outcome = await restoreSnapshot(projectRoot, target.id);
    releaseReviewLock(projectRoot);
    console.log(`Reverted ${projectRoot} to snapshot ${target.id} (${target.takenAt || 'unknown time'}).`);
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
    console.error(`Error reverting snapshot: ${message(error)}`);
    return 1;
  }
}

/**
 * Always exit 0: having nothing to revert is not a failure. But a shadow repo
 * for a *nearby* directory almost always means freecode was launched from
 * there, and "no snapshots" would be a wrong answer to the question actually
 * being asked — so name those directories rather than leave someone to guess.
 */
function reportNoSnapshots(projectRoot: string): number {
  console.log(
    `No snapshots for this project (${projectRoot}). freecode takes one before an agent session's first write.`,
  );
  const nearby = listShadowProjects().filter((path) => isUnder(resolve(projectRoot), path));
  if (nearby.length > 0) {
    console.log('\nSnapshots do exist for:');
    for (const path of nearby) console.log(`  ${path}`);
    console.log('\nRun `freecode checkpoint` from one of those directories.');
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
