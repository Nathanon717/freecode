/**
 * @role `freecode checkpoint` — the review surface over the snapshot taken before a session's first write: `list` what exists, `diff` what changed, then `revert` it or `accept` it as the new baseline. Drives [../snapshots/index.md](../snapshots/index.md), prints [../snapshots/semantic-diff.md](../snapshots/semantic-diff.md), and frees [../snapshots/review-lock.md](../snapshots/review-lock.md).
 *
 * @readwhen
 * - Changing what `freecode checkpoint` prints, its subcommands, its flags, or its exit codes.
 * - Debugging a revert that reported success but left the project wrong.
 * - Changing how a delegated change is reviewed or what frees the project for the next one, and debugging `accept`/`revert` refused as a review decision — that refusal reads the `FREECODE_SANDBOXED` marker set by [../agent/tools/shell.md](../agent/tools/shell.md).
 */

// Runs before the heavy module graph loads (see src/index.ts): this is git and
// nothing else, so it must not pay for the ai SDK or the store to tell someone
// their files are recoverable.
//
// The verb, not a flag, carries the intent. `undo` was one command whose default
// action was destructive, so a mistyped review flag fell through to *restoring*
// the project; here the only way to reach `revert` is to type it.

import { resolve } from 'path';
import { processFlag } from './args.js';
import { isUnder, resolveSnapshotRoot } from './checkpoint-root.js';
import { listExcludedPaths } from '../snapshots/coverage.js';
import {
  inspectHint,
  listSnapshots,
  restoreSnapshot,
  snapshotDiffPatch,
  snapshotDiffStat,
  snapshotGitDirDiff,
  takeSnapshot,
  type SnapshotMeta,
} from '../snapshots/index.js';
import { readReviewLock, releaseReviewLock, reviewLockPath } from '../snapshots/review-lock.js';
import { semanticDiff } from '../snapshots/semantic-diff.js';
import { gitAvailable, listShadowProjects } from '../snapshots/shadow-repo.js';

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
 * The two verbs that end a review, refused when this process is a child of
 * `shell_exec` (which stamps `FREECODE_SANDBOXED=1` — agent/tools/shell.ts).
 *
 * Without this, the agent under review reviews itself: `freecode` is on `$PATH`,
 * so one `checkpoint accept` released the lock, took a fresh baseline that made
 * `checkpoint diff` report "No changes", left the work on disk, and cleared the
 * way for the next delegation. `revert` is the same hole pointed the other way —
 * it destroys the evidence instead of blessing it.
 *
 * `list` and `diff` stay available on purpose: reading is not approving, and an
 * agent asked to review its own work should be able to look at it.
 */
function isReviewEnding(verb: Verb): boolean {
  return verb === 'accept' || verb === 'revert';
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

  // Before anything touches the store: `accept` snapshots first and releases the
  // lock second, so a check any later would refuse and still leave an
  // agent-triggered baseline sitting in `checkpoint list`.
  if (isReviewEnding(options.verb) && process.env['FREECODE_SANDBOXED']) {
    console.error(
      `Error: \`checkpoint ${options.verb}\` is a review decision, and this process is running ` +
      `inside an agent's shell (FREECODE_SANDBOXED is set), so it cannot make one.\n` +
      `Run it from your own terminal. \`checkpoint list\` and \`checkpoint diff\` work here.`,
    );
    return 1;
  }

  const projectRoot = await resolveSnapshotRoot(startDir);
  // `accept` is the one verb that works with nothing snapshotted: it *takes* a
  // snapshot, and it is also the way out of a review lock left behind by a run
  // whose own snapshot never happened.
  if (options.verb === 'accept') return accept(projectRoot ?? resolve(startDir));
  if (!projectRoot) return reportNoSnapshots(startDir, options.verb);
  if (projectRoot !== resolve(startDir)) console.log(`Using snapshots for ${projectRoot}.\n`);

  let snapshots: SnapshotMeta[];
  try {
    snapshots = await listSnapshots(projectRoot);
  } catch (error) {
    console.error(`Error reading snapshots: ${message(error)}`);
    return 1;
  }

  if (snapshots.length === 0) return reportNoSnapshots(projectRoot, options.verb);
  if (options.verb === 'list') return reportList(projectRoot, snapshots, options.limit);

  const target = options.id
    ? snapshots.find((s) => s.id === options.id)
    : outstanding(projectRoot, snapshots);
  if (target === 'unsnapshotted') return reportUnsnapshotted(options.verb);
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
 * Which snapshot a bare `diff` or `revert` means, or `'unsnapshotted'` when the
 * honest answer is "none of them".
 *
 * Not simply the newest. Only *delegated* runs are serialised by the review
 * lock — an interactive or `--script` session still snapshots itself before its
 * own first write, so one starting up between a delegation and its review makes
 * the newest snapshot a point *after* the agent's work. Reviewing against that
 * one hides the change entirely, and reverting to it would keep the unreviewed
 * work while reporting success.
 *
 * The lock now carries the id the delegated run actually took (R4), so the usual
 * answer is exact rather than inferred. The timestamp walk below it is the
 * fallback for a run killed before it could record one: the oldest snapshot taken
 * since the claim, which is the delegated run's own if it took any. Anything that
 * landed on top is then shown rather than hidden, which is the right way round.
 *
 * `unsnapshotted` is the case R4 made visible. A run whose snapshot *failed* holds
 * the lock with no snapshot of its own, and the timestamp walk would then happily
 * select a concurrent session's post-damage snapshot — reporting a clean diff, and
 * a successful revert, against a state nobody has reviewed.
 */
function outstanding(projectRoot: string, snapshots: SnapshotMeta[]): SnapshotMeta | 'unsnapshotted' {
  const held = readReviewLock(projectRoot);
  if (!held) return snapshots[0];
  // Pruning can outlive the lock (KEEP_SNAPSHOTS in snapshots/auto.ts), so a
  // recorded id that is no longer there falls through rather than dead-ends.
  const exact = held.snapshotId && snapshots.find((s) => s.id === held.snapshotId);
  if (exact) return exact;
  if (held.snapshotFailed) return 'unsnapshotted';
  if (!held.startedAt) return snapshots[0];
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
    // A `.git`-only change is the finding's own signature — a `core.hooksPath`
    // edit leaves the worktree spotless — so "no changes since this snapshot"
    // would be false in exactly the case that matters most. The stat is not
    // extended to cover `.git`: one flagged line sends the reader to `diff`,
    // which shows the config and hooks in full.
    const touchedGitDir = (await safeGitDirDiff(projectRoot, snapshot)) !== '';
    if (stat) console.log(indent(stat));
    else console.log(touchedGitDir ? '    (no changes to your files)' : '    (no changes since this snapshot)');
    if (touchedGitDir) console.log('    plus changes inside .git — run `checkpoint diff` to see them');
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
  let gitPatch: string;
  try {
    patch = await snapshotDiffPatch(projectRoot, target.id);
    gitPatch = await snapshotGitDirDiff(projectRoot, target);
  } catch (error) {
    console.error(`Error reading snapshot ${target.id}: ${message(error)}`);
    return 1;
  }

  if (patch === '' && gitPatch === '') {
    console.log(`No changes since snapshot ${target.id} (${target.takenAt || 'unknown time'}).`);
    return 0;
  }
  if (patch !== '') console.log(patchMode ? patch : semanticDiff(patch));
  // Always the raw patch, in both modes, and always last. It is a handful of
  // lines of `.git/config`, and it is the one part of a review where paraphrasing
  // would be a disservice — `core.hooksPath` pointing somewhere new is the whole
  // finding, and it means nothing summarised.
  if (gitPatch !== '') {
    console.log(`${patch === '' ? '' : '\n'}--- inside .git (config and hooks) ---\n`);
    console.log(gitPatch);
  }
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
    // The lock stays held, and this is the one failure that can therefore strand
    // someone: `accept` is where a failed snapshot sends them, and it must write the
    // same store whose breakage sent them. Naming the file is the last resort that
    // `claimReviewLock`'s `store-unwritable` branch already documents for itself.
    if (readReviewLock(projectRoot)) {
      console.error(
        `\nThe review lock is still held, because accepting without a baseline would let the ` +
        `next delegated run start against a state nothing can restore.\n` +
        `If the snapshot store itself is broken there is no route through freecode from here — ` +
        `fix the directory or set FREECODE_HOME somewhere writable, then run this again. As a ` +
        `last resort, delete the lock file by hand:\n  ${reviewLockPath(projectRoot)}`,
      );
    }
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

    // Either half left undone is a failed revert, not a revert with a note. A
    // `.git` that did not go back leaves a repo that is neither the snapshot nor
    // what the agent produced (refs rolled back against a stale index, `fsck`
    // complaining, possibly the agent's own `core.hooksPath` still set); a file
    // that could not be written still holds the agent's content outright. Freeing
    // the lock in either case would mark that state reviewed and admit the next
    // delegated run against it, and the repair — running this same command again
    // once the holder lets go — is only reachable while the lock still says a
    // review is outstanding.
    const gitDirMissing = Boolean(target.gitDir) && !outcome.gitDirRestored;
    if (gitDirMissing || outcome.lockedPaths.length > 0) {
      console.error(
        `Partly reverted ${projectRoot} to snapshot ${target.id}: ` +
        (outcome.lockedPaths.length > 0
          ? 'some of your files could not be written'
          : 'your files are back') +
        (gitDirMissing ? ', and the .git directory is not back' : '') + '.',
      );
      for (const warning of outcome.warnings) console.error(`\n${warning}`);
      console.error('\nNothing has been marked reviewed, and the project is still locked to this run.');
      return 1;
    }

    releaseReviewLock(projectRoot);
    console.log(`Reverted ${projectRoot} to snapshot ${target.id} (${target.takenAt || 'unknown time'}).`);
    if (outcome.gitDirRestored) {
      console.log('Git history, branches, config, hooks, and the staged/unstaged split restored.');
    }
    // Only printed when HEAD actually resolves to the recorded commit again —
    // saying "rolled back" while the user is still standing on the agent's
    // branch is the failure this wording exists to avoid.
    if (outcome.headRestored) {
      const what = target.branch ? `Branch ${target.branch} and your checkout` : 'Detached HEAD';
      console.log(`${what} rolled back to ${target.head?.slice(0, 8)}.`);
    }
    for (const warning of outcome.warnings) console.log(`\nWarning: ${warning}`);
    // Coverage is now everything but a short exclusion list, so the honest note is
    // the one that names the paths actually skipped — "files ignored by .gitignore
    // were left alone" is both false and unactionable now that they are covered.
    const excluded = listExcludedPaths(projectRoot);
    if (excluded.length > 0) {
      console.log(
        `\nNote: ${excluded.length} path(s) are outside snapshot coverage and were left exactly as they are:`,
      );
      for (const path of excluded) console.log(`  ${path}`);
    }
    return 0;
  } catch (error) {
    console.error(`Error reverting snapshot: ${message(error)}`);
    return 1;
  }
}

/**
 * Refuses to answer for a delegated run that has no snapshot of its own.
 *
 * Silence would be the alternative, and it is the worse one: every snapshot in the
 * store belongs to some *other* session, so a bare `diff` would report a clean
 * tree and a bare `revert` would restore a state the agent had already damaged,
 * both with exit 0. Naming an id explicitly still works — that is a deliberate
 * choice about a specific snapshot rather than a guess made on the user's behalf.
 */
function reportUnsnapshotted(verb: Verb): number {
  console.error(
    `Error: the delegated run holding this project's review lock changed it, but its ` +
    `checkpoint snapshot failed — so no snapshot marks where that run's work began.\n` +
    `A bare \`checkpoint ${verb}\` would answer about some other session's snapshot, which ` +
    `is worse than not answering.\n` +
    'Review the changes with `git status` and `git diff`, then `freecode checkpoint accept` to ' +
    'clear the lock — or name a snapshot yourself (`freecode checkpoint list`).',
  );
  return 1;
}

/**
 * Always exit 0: having nothing to revert is not a failure. But a shadow repo
 * for a *nearby* directory almost always means freecode was launched from
 * there, and "no snapshots" would be a wrong answer to the question actually
 * being asked — so name those directories rather than leave someone to guess.
 */
function reportNoSnapshots(projectRoot: string, verb: Verb): number {
  // Reached before `outstanding()` is ever consulted, so it has to answer for the
  // R4 case itself: a delegated run that wrote and could not snapshot leaves an
  // empty store, and "freecode takes one before the first write" then reads as
  // "nothing happened here" about a project the agent has already changed. Only
  // the two verbs that would otherwise answer *about* a snapshot divert; `list`
  // has nothing to be wrong about.
  if (verb !== 'list' && readReviewLock(projectRoot)?.snapshotFailed) return reportUnsnapshotted(verb);

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

/** As `safeDiffStat`: a listing of many snapshots must not die on one unreadable. */
async function safeGitDirDiff(projectRoot: string, snapshot: SnapshotMeta): Promise<string> {
  try {
    return await snapshotGitDirDiff(projectRoot, snapshot);
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
