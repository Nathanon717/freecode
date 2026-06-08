import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import type { Interface } from 'readline';
import chalk from 'chalk';
import { countWrappedLines, runRawPicker } from '../cli/raw-picker.js';
import { redrawBanner } from '../cli/banner.js';
import {
  isBottomUIActive,
  setEvalRunning,
  setModelStatus,
  setTokenCount,
  setupBottomUI,
  teardownBottomUI,
} from '../cli/terminal-ui.js';
import { resetEvalWorkDir, startEvalScenario } from '../cli/eval-runner.js';
import { modelSlug, statusCircle } from '../cli/eval-dots.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const HUMANEVAL_DATA_DEFAULT = resolve(_dirname, '..', '..', 'playground', 'humaneval', 'data', 'HumanEval.jsonl.gz');
const HUMANEVAL_EXAMPLE_DATA = resolve(_dirname, '..', '..', 'playground', 'humaneval', 'data', 'example_problem.jsonl');
const HUMANEVAL_RUNS_DIR = resolve(_dirname, '..', '..', 'playground', 'humaneval', '.runs');
const HUMANEVAL_RESULTS_DIR = join(HUMANEVAL_RUNS_DIR, '.results');

const VIEWPORT_SIZE = 20;

type HumanEvalResultMap = Record<string, 'pass' | 'fail'>;

function loadHumanEvalResults(model: string): HumanEvalResultMap {
  const file = join(HUMANEVAL_RESULTS_DIR, `${modelSlug(model)}.json`);
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf-8')) as HumanEvalResultMap; } catch { return {}; }
}

function saveHumanEvalResult(model: string, taskId: string, status: 'pass' | 'fail', results: HumanEvalResultMap): void {
  mkdirSync(HUMANEVAL_RESULTS_DIR, { recursive: true });
  results[taskId] = status;
  const file = join(HUMANEVAL_RESULTS_DIR, `${modelSlug(model)}.json`);
  writeFileSync(file, JSON.stringify(results, null, 2) + '\n', 'utf-8');
}

interface HumanEvalProblem {
  task_id: string;
  prompt: string;
  canonical_solution: string;
  test: string;
  entry_point: string;
}

function readProblems(): HumanEvalProblem[] {
  const dataPath = process.env['HUMANEVAL_DATA'] ?? HUMANEVAL_DATA_DEFAULT;
  const compressed = readFileSync(dataPath);
  const text = gunzipSync(compressed).toString('utf-8');
  const main = text.split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as HumanEvalProblem);

  let example: HumanEvalProblem[] = [];
  if (existsSync(HUMANEVAL_EXAMPLE_DATA)) {
    example = readFileSync(HUMANEVAL_EXAMPLE_DATA, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as HumanEvalProblem);
  }

  return [...example, ...main];
}

function clampViewport(sel: number, viewportStart: number): number {
  if (sel < viewportStart) return sel;
  if (sel >= viewportStart + VIEWPORT_SIZE) return sel - VIEWPORT_SIZE + 1;
  return viewportStart;
}

function buildPickerLines(problems: HumanEvalProblem[], sel: number, viewportStart: number, results: HumanEvalResultMap): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('HumanEval problems')}`);
  lines.push(`  ${chalk.dim('Up/Down navigate, Enter run selected, a run all, Esc close')}`);
  lines.push('');
  const viewportEnd = Math.min(viewportStart + VIEWPORT_SIZE, problems.length);
  for (let i = viewportStart; i < viewportEnd; i++) {
    const p = problems[i];
    const active = i === sel;
    const cursor = active ? chalk.cyan('>') : ' ';
    const label = active ? chalk.inverse(p.task_id) : chalk.cyan(p.task_id);
    const r = results[p.task_id];
    const dot = statusCircle(r === 'pass' ? 'green' : r === 'fail' ? 'red' : 'grey');
    lines.push(`  ${cursor} ${dot} ${label}  ${chalk.dim(p.entry_point)}`);
  }
  lines.push('');
  lines.push(chalk.dim(`  ${sel + 1} / ${problems.length}`));
  lines.push('');
  return lines;
}

function resetTerminalPrivateModes(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(
    '\x1b[0m' +
    '\x1b[?25h' +
    '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l' +
    '\x1b[?2004l' +
    '\x1b[r',
  );
}

function resetStdinConsoleMode(): void {
  if (!process.stdin.isTTY) return;
  process.stdin.setRawMode(false);
  process.stdin.resume();
  process.stdin.setRawMode(true);
  process.stdin.setRawMode(false);
  process.stdin.resume();
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

async function runOneProblem(problem: HumanEvalProblem, model: string): Promise<RunStatus> {
  const taskSlug = problem.task_id.replace(/\//g, '-');
  const runDir = join(HUMANEVAL_RUNS_DIR, taskSlug);
  mkdirSync(runDir, { recursive: true });
  resetEvalWorkDir(runDir);

  const termWidth = process.stdout.columns || 80;
  const headerSuffix = ' ──';
  const dashCount = Math.max(2, termWidth - 4 - problem.task_id.length - headerSuffix.length);
  console.log(chalk.bold.cyan(`\n── ${problem.task_id}${headerSuffix}${'─'.repeat(dashCount)}`));
  console.log(chalk.dim(buildAgentPrompt(problem)));
  console.log('');

  setEvalRunning(problem.task_id);
  const handle = startEvalScenario(runDir, buildAgentPrompt(problem), model || undefined);
  let result;
  try {
    result = await handle.promise;
  } finally {
    setEvalRunning(null);
  }

  const evalModel = model || '';
  const colonIdx = evalModel.indexOf(':');
  if (colonIdx !== -1) setModelStatus(evalModel.slice(0, colonIdx), evalModel.slice(colonIdx + 1));
  else if (evalModel) setModelStatus('', evalModel);
  setTokenCount(result.tokens.total);

  if (result.exitCode !== 0) {
    console.log(chalk.yellow(`\nINCOMPLETE  ${chalk.bold(problem.task_id)}  (agent did not finish)`));
    return 'incomplete';
  }

  const solutionPath = join(result.workDir, 'solution.py');
  if (!existsSync(solutionPath)) {
    console.log(chalk.red(`\nFAIL  ${chalk.bold(problem.task_id)}  (solution.py not found in work dir)`));
    return 'fail';
  }

  const solution = readFileSync(solutionPath, 'utf-8');
  const checkProgram = `${solution}\n${problem.test}\ncheck(${problem.entry_point})\n`;
  const checkFile = join(runDir, '.run', 'check.py');
  writeFileSync(checkFile, checkProgram, 'utf-8');

  const pyResult = spawnSync('python', [checkFile], {
    timeout: 10_000,
    encoding: 'utf-8',
    cwd: result.workDir,
  });

  if (pyResult.status === 0 && pyResult.error == null) {
    console.log(chalk.green(`\nPASS  ${chalk.bold(problem.task_id)}`));
    console.log(chalk.dim(`  tokens: ${result.tokens.total} | tool calls: ${result.toolCalls.length}`));
    return 'pass';
  }

  console.log(chalk.red(`\nFAIL  ${chalk.bold(problem.task_id)}`));
  if (pyResult.error) {
    console.log(chalk.red(`  (could not run python: ${pyResult.error.message})`));
  } else {
    const errText = ((pyResult.stderr || '') + (pyResult.stdout || '')).trim();
    if (errText) {
      const tail = errText.split('\n').slice(-5).join('\n  ');
      console.log(chalk.red(`  ${tail}`));
    }
  }
  return 'fail';
}

export async function runHumanEvalMenu(rl: Interface, _projectRoot: string, getSelectedModel: () => string): Promise<void> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    let problems: HumanEvalProblem[];
    try {
      problems = readProblems();
    } catch (err) {
      console.log(chalk.red(`Failed to load HumanEval dataset: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    const model = getSelectedModel();
    const results = loadHumanEvalResults(model);

    if (!process.stdin.isTTY) {
      console.log(chalk.bold('HumanEval problems\n'));
      for (const p of problems) {
        console.log(`  ${chalk.cyan(p.task_id)}  ${chalk.dim(p.entry_point)}`);
      }
      return;
    }

    let sel = 0;
    let viewportStart = 0;

    const chosen = await runRawPicker<HumanEvalProblem[] | null>(rl, {
      render: () => buildPickerLines(problems, sel, viewportStart, results),
      countLines: countWrappedLines,
      onKey(key, redraw, close) {
        if (key === '\x1b') { close(null); return; }
        if (key === '\x1b[A') {
          sel = (sel - 1 + problems.length) % problems.length;
          viewportStart = clampViewport(sel, viewportStart);
          redraw(); return;
        }
        if (key === '\x1b[B') {
          sel = (sel + 1) % problems.length;
          viewportStart = clampViewport(sel, viewportStart);
          redraw(); return;
        }
        if (key === '\r' || key === '\n') { close([problems[sel]]); return; }
        if (key === 'a' || key === 'A') { close([...problems]); return; }
      },
    });

    if (!chosen) {
      if (process.stdin.isTTY) redrawBanner();
      return;
    }

    let passed = 0;
    let failed = 0;
    let incomplete = 0;

    for (const problem of chosen) {
      const status = await runOneProblem(problem, model);
      if (status === 'pass') { passed++; saveHumanEvalResult(model, problem.task_id, 'pass', results); }
      else if (status === 'fail') { failed++; saveHumanEvalResult(model, problem.task_id, 'fail', results); }
      else incomplete++;
    }

    if (chosen.length > 1) {
      console.log('');
      const parts = [
        passed > 0 ? chalk.green(`${passed} passed`) : null,
        failed > 0 ? chalk.red(`${failed} failed`) : null,
        incomplete > 0 ? chalk.yellow(`${incomplete} incomplete`) : null,
      ].filter(Boolean);
      const color = failed > 0 ? chalk.red : incomplete > 0 ? chalk.yellow : chalk.green;
      console.log(color(`Results: ${parts.join(', ')}`));
    }
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) {
      resetStdinConsoleMode();
      resetTerminalPrivateModes();
      setupBottomUI();
    }
  }
}
