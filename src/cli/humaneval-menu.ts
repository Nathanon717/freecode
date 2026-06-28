import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import type { Interface } from 'readline';
import chalk from 'chalk';
import { getBannerColor } from './banner.js';
import { VIEWPORT_SIZE, clampViewport, type MenuTab } from './list-menu.js';
import {
  setActiveModelFromString,
  setTokenCount,
} from './terminal-ui.js';
import { resetEvalWorkDir, startEvalScenario } from '../eval/runner.js';
import { printEvalHeader, printEvalSummary } from './eval-screen.js';
import { statusCircle } from './eval-dots.js';
import { InlineActionMenu } from './action-menu.js';
import { appendEvalRun } from '../providers/model-store.js';
import { buildSystemPrompt } from '../agent/system-prompt.js';
import type { HumanEvalProblem, HumanEvalResultMap } from '../eval/humaneval-data.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const HUMANEVAL_RUNS_DIR = resolve(_dirname, '..', '..', 'playground', 'humaneval', '.runs');

// Renders the problem rows with a status dot (from prior results) and the
// entry_point. Mirrors `buildEvalPickerScreen` for the Custom tab; the viewport
// slice is applied by the caller. `selected` is -1 when the tab row is focused
// (no row highlighted).
function buildHumanEvalPickerScreen(
  problems: HumanEvalProblem[],
  selected: number,
  results: HumanEvalResultMap,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const active = i === selected;
    const cursor = active ? getBannerColor()('▶') : ' ';
    const label = active ? chalk.inverse(p.task_id) : getBannerColor()(p.task_id);
    const r = results[p.task_id];
    const dot = statusCircle(r === 'pass' ? 'green' : r === 'fail' ? 'red' : 'grey');
    lines.push(`  ${cursor} ${dot} ${label}  ${chalk.dim(p.entry_point)}`);
  }
  lines.push('');
  return lines;
}

// Detail view for a single problem: last pass/fail badge, entry_point, and the
// problem prompt. Mirrors `buildEvalDetailScreen` for the Custom tab, but the
// HumanEval results map only carries pass/fail (no per-check grading details).
function buildHumanEvalDetailScreen(
  problem: HumanEvalProblem,
  results: HumanEvalResultMap,
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${getBannerColor().bold(problem.task_id)}`);
  lines.push(`  ${chalk.dim('← / Esc back')}`);
  lines.push('');
  const r = results[problem.task_id];
  const badge = r === 'pass' ? chalk.green('PASS') : r === 'fail' ? chalk.red('FAIL') : chalk.gray('No results yet');
  lines.push(`  ${badge}  ${chalk.dim(problem.entry_point)}`);
  lines.push('');
  for (const line of problem.prompt.split('\n')) lines.push(`  ${chalk.dim(line)}`);
  lines.push('');
  return lines;
}

// Builds the HumanEval list-menu tab. Items are the individual problems with a
// status dot; a detail view (→) and a Run/View action menu (Enter). 'a' runs
// every problem. Selecting Run closes the menu via `choose([problem])`. Mirrors
// `buildCustomEvalTab` (the Custom sibling); there is no "Edit" action because
// benchmark problems are not editable.
export function buildHumanEvalTab<R>(
  problems: HumanEvalProblem[],
  results: HumanEvalResultMap,
  choose: (problems: HumanEvalProblem[]) => R,
): MenuTab<R> {
  const actionMenu = new InlineActionMenu(['Run', 'View']);
  let viewportStart = 0;
  return {
    id: 'humaneval',
    label: 'HumanEval',
    count: () => problems.length,
    renderBody: (selected) => {
      // `selected` is -1 when the tab row is focused; clamp the viewport math to
      // a real item while still passing the raw value through so no row highlights.
      const sel = Math.max(0, selected);
      viewportStart = clampViewport(sel, viewportStart);
      const viewportEnd = Math.min(viewportStart + VIEWPORT_SIZE, problems.length);
      const visible = problems.slice(viewportStart, viewportEnd);
      return {
        lines: buildHumanEvalPickerScreen(
          visible,
          selected < 0 ? -1 : sel - viewportStart,
          results,
        ),
        selectedLineIdx: sel - viewportStart,
      };
    },
    renderDetail: (selected) => buildHumanEvalDetailScreen(problems[selected], results),
    controls: 'Up/Down navigate, Enter actions, a run all, → details, Esc close',
    actionMenu: {
      menu: actionMenu,
      actionHint: `  ${chalk.dim('↑/↓ action, Enter select, Esc back')}`,
      onSelect: (option, ctx) => {
        if (option === 'Run') ctx.close(choose([problems[ctx.getSelected()]]));
        else if (option === 'View') ctx.enterDetail();
      },
    },
    onKey: (key, ctx) => {
      if (key === 'a' || key === 'A') { ctx.close(choose([...problems])); return true; }
      return false;
    },
  };
}

function buildAgentPrompt(problem: HumanEvalProblem): string {
  return [
    'Write a Python implementation of the following function.',
    'Save the complete function definition (including the signature and any needed imports) to a file named `solution.py`.',
    '',
    problem.prompt,
  ].join('\n');
}

type RunStatus = 'pass' | 'fail' | 'incomplete';
type RunResult = { status: RunStatus; userCancelled: boolean };

interface TranscriptTurn {
  systemPrompt: string;
  userMessage: string;
  tokenUsage: { input?: number; output?: number };
  toolCalls: unknown[];
}

function askContinuePrompt(rl: Interface, message: string): Promise<boolean> {
  return new Promise(resolve => {
    rl.question(`\n${message} [Y/n] `, (answer) => {
      resolve(answer.trim().toLowerCase() !== 'n');
    });
  });
}

interface RetryStatusInfo { name: string; label: string; targetMs: number }

// Builds the poll callback that watches `retryStatusFile` for rate-limit events.
// On each tick, when a *new* event appears (a targetMs not seen before) it asks the
// user whether to continue, calling `onDecline` if they decline. Re-prompts are
// suppressed while a prompt is open and for any targetMs already handled; read
// errors are swallowed. State (`promptingUser`, `lastSeenTargetMs`) lives in the
// returned closure, so the caller just installs it on a timer.
export function makeRetryPrompter(
  retryStatusFile: string,
  ask: (message: string) => Promise<boolean>,
  onDecline: () => void,
): () => void {
  let promptingUser = false;
  let lastSeenTargetMs: number | null = null;
  return () => {
    if (promptingUser) return;
    try {
      if (!existsSync(retryStatusFile)) return;
      const raw = readFileSync(retryStatusFile, 'utf-8').trim();
      if (!raw) return;
      const info = JSON.parse(raw) as RetryStatusInfo | null;
      if (info === null || info.targetMs === lastSeenTargetMs) return;
      lastSeenTargetMs = info.targetMs;
      promptingUser = true;
      const waitSec = Math.ceil((info.targetMs - Date.now()) / 1000);
      const label = waitSec > 0 ? ` (waiting ${waitSec}s)` : '';
      ask(`Rate limit hit${label}. Continue?`)
        .then(cont => { promptingUser = false; if (!cont) onDecline(); })
        .catch(() => { promptingUser = false; });
    } catch { /* ignore poll errors */ }
  };
}

async function runOneProblem(problem: HumanEvalProblem, model: string, rl?: Interface): Promise<RunResult> {
  const startMs = Date.now();
  const taskSlug = problem.task_id.replace(/\//g, '-');
  const runDir = join(HUMANEVAL_RUNS_DIR, taskSlug);
  mkdirSync(runDir, { recursive: true });
  resetEvalWorkDir(runDir);

  printEvalHeader(problem.task_id, buildAgentPrompt(problem));

  const handle = startEvalScenario(runDir, buildAgentPrompt(problem), model || undefined);

  let userCancelled = false;

  const pollTimer = rl ? setInterval(
    makeRetryPrompter(
      handle.retryStatusFile,
      (message) => askContinuePrompt(rl, message),
      () => { userCancelled = true; handle.cancel(); },
    ),
    500,
  ) : null;

  const result = await handle.promise;
  if (pollTimer !== null) clearInterval(pollTimer);

  const evalModel = model || '';
  setActiveModelFromString(evalModel);
  setTokenCount(result.tokens.total);

  const baseSummary = {
    timestamp: new Date().toISOString(),
    taskId: problem.task_id,
    turns: result.toolCalls.length,
    tokenUsage: { input: result.tokens.prompt, output: result.tokens.output },
    durationMs: Date.now() - startMs,
  };

  const transcriptTurn: TranscriptTurn = {
    systemPrompt: buildSystemPrompt(),
    userMessage: buildAgentPrompt(problem),
    tokenUsage: { input: result.tokens.prompt, output: result.tokens.output },
    toolCalls: result.toolCalls,
  };

  if (result.exitCode !== 0) {
    console.log(chalk.yellow(`\nINCOMPLETE  ${chalk.bold(problem.task_id)}  (agent did not finish)`));
    appendEvalRun(evalModel, 'humaneval',
      { ...baseSummary, pass: false, error: 'agent did not finish' },
      { pass: false, freecodeVersion: null, transcript: [transcriptTurn],
        scoringOutcome: { exitCode: result.exitCode } },
    );
    return { status: 'incomplete', userCancelled };
  }

  const solutionPath = join(result.workDir, 'solution.py');
  if (!existsSync(solutionPath)) {
    console.log(chalk.red(`\nFAIL  ${chalk.bold(problem.task_id)}  (solution.py not found in work dir)`));
    appendEvalRun(evalModel, 'humaneval',
      { ...baseSummary, pass: false, error: 'solution.py not found' },
      { pass: false, freecodeVersion: null, transcript: [transcriptTurn],
        scoringOutcome: { exitCode: result.exitCode } },
    );
    return { status: 'fail', userCancelled };
  }

  const solution = readFileSync(solutionPath, 'utf-8');
  const checkProgram = `${solution}\n${problem.test}\ncheck(${problem.entry_point})\n`;
  const checkFile = join(runDir, '.run', 'check.py');
  writeFileSync(checkFile, checkProgram, 'utf-8');

  const pythonCmd = (() => {
    const candidates = ['python3', 'python'];
    for (const cmd of candidates) {
      const r = spawnSync(cmd, ['--version'], { timeout: 2000, encoding: 'utf-8' });
      if (r.status === 0) return cmd;
    }
    return 'python';
  })();
  const pyResult = spawnSync(pythonCmd, [checkFile], {
    timeout: 10_000,
    encoding: 'utf-8',
    cwd: result.workDir,
  });

  if (pyResult.status === 0 && pyResult.error == null) {
    console.log(chalk.green(`\nPASS  ${chalk.bold(problem.task_id)}`));
    console.log(chalk.dim(`  tokens: ${result.tokens.total} | tool calls: ${result.toolCalls.length}`));
    appendEvalRun(evalModel, 'humaneval',
      { ...baseSummary, pass: true, error: null },
      { pass: true, freecodeVersion: null, transcript: [transcriptTurn],
        scoringOutcome: { pass: true } },
    );
    return { status: 'pass', userCancelled };
  }

  console.log(chalk.red(`\nFAIL  ${chalk.bold(problem.task_id)}`));
  if (pyResult.error) {
    console.log(chalk.red(`  (could not run python: ${pyResult.error.message})`));
    appendEvalRun(evalModel, 'humaneval',
      { ...baseSummary, pass: false, error: `could not run python: ${pyResult.error.message}` },
      { pass: false, freecodeVersion: null, transcript: [transcriptTurn],
        scoringOutcome: { pythonError: pyResult.error.message } },
    );
  } else {
    const errText = ((pyResult.stderr || '') + (pyResult.stdout || '')).trim();
    if (errText) {
      const tail = errText.split('\n').slice(-5).join('\n  ');
      console.log(chalk.red(`  ${tail}`));
    }
    const failReason = errText ? errText.split('\n').slice(-5).join('\n') : 'python check failed';
    appendEvalRun(evalModel, 'humaneval',
      { ...baseSummary, pass: false, error: null },
      { pass: false, failReason, freecodeVersion: null, transcript: [transcriptTurn],
        scoringOutcome: { exitCode: pyResult.status, stderr: pyResult.stderr, stdout: pyResult.stdout } },
    );
  }
  return { status: 'fail', userCancelled };
}

// Non-TTY listing of the HumanEval problems.
export function printHumanEvalList(problems: HumanEvalProblem[]): void {
  console.log(chalk.bold('HumanEval problems\n'));
  for (const p of problems) {
    console.log(`  ${chalk.cyan(p.task_id)}  ${chalk.dim(p.entry_point)}`);
  }
}

// Runs the chosen HumanEval problems and prints a summary when more than one ran.
export async function runHumanEvalProblems(
  chosen: HumanEvalProblem[],
  model: string,
  rl: Interface,
): Promise<void> {
  let passed = 0;
  let failed = 0;
  let incomplete = 0;

  const autoMode = chosen.length > 1;
  for (const problem of chosen) {
    const { status, userCancelled } = await runOneProblem(problem, model, autoMode ? rl : undefined);
    if (status === 'pass') passed++;
    else if (status === 'fail') failed++;
    else incomplete++;
    if (userCancelled) break;
  }

  if (chosen.length > 1) printEvalSummary(passed, failed, incomplete);
}
