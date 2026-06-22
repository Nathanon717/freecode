import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import https from 'https';
import type { Interface } from 'readline';
import chalk from 'chalk';
import {
  countWrappedLines,
  resetStdinConsoleMode,
  resetTerminalPrivateModes,
  runRawPicker,
} from '../cli/raw-picker.js';
import { redrawBanner } from '../cli/banner.js';
import {
  isBottomUIActive,
  setModelStatus,
  setTokenCount,
  setupBottomUI,
  teardownBottomUI,
} from '../cli/terminal-ui.js';
import { resetEvalWorkDir, startEvalScenario } from '../cli/eval-runner.js';
import { printEvalHeader } from '../cli/eval-screen.js';
import { statusCircle } from '../cli/eval-dots.js';
import { appendEvalRun, getHumanEvalResults } from '../providers/model-store.js';
import { ensureStoreReady } from '../providers/db.js';
import { buildSystemPrompt } from '../agent/system-prompt.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const HUMANEVAL_DATA_DEFAULT = resolve(_dirname, '..', '..', 'playground', 'humaneval', 'data', 'HumanEval.jsonl.gz');
const HUMANEVAL_EXAMPLE_DATA = process.env['HUMANEVAL_EXAMPLE_DATA'] ?? resolve(_dirname, '..', '..', 'playground', 'humaneval', 'data', 'example_problem.jsonl');
const HUMANEVAL_RUNS_DIR = resolve(_dirname, '..', '..', 'playground', 'humaneval', '.runs');

const HUMANEVAL_DOWNLOAD_URL = 'https://github.com/openai/human-eval/raw/master/data/HumanEval.jsonl.gz';
const VIEWPORT_SIZE = 20;

export function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const follow = (u: string) => {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location!);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

type HumanEvalResultMap = Record<string, 'pass' | 'fail'>;

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
  const totalItems = 1 + problems.length; // index 0 = Run All, 1..N = problems
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('HumanEval problems')}`);
  lines.push(`  ${chalk.dim('Up/Down navigate, Enter to select, Esc close')}`);
  lines.push('');
  const viewportEnd = Math.min(viewportStart + VIEWPORT_SIZE, totalItems);
  for (let i = viewportStart; i < viewportEnd; i++) {
    const active = i === sel;
    const cursor = active ? chalk.cyan('>') : ' ';
    if (i === 0) {
      const passCount = Object.values(results).filter(v => v === 'pass').length;
      const total = problems.length;
      const summary = passCount > 0 ? chalk.dim(` ${passCount}/${total} passed`) : chalk.dim(` ${total} problems`);
      const label = active ? chalk.inverse('Run All') : chalk.bold('Run All');
      lines.push(`  ${cursor}   ${label}${summary}`);
    } else {
      const p = problems[i - 1];
      const label = active ? chalk.inverse(p.task_id) : chalk.cyan(p.task_id);
      const r = results[p.task_id];
      const dot = statusCircle(r === 'pass' ? 'green' : r === 'fail' ? 'red' : 'grey');
      lines.push(`  ${cursor} ${dot} ${label}  ${chalk.dim(p.entry_point)}`);
    }
  }
  lines.push('');
  lines.push(chalk.dim(`  ${sel + 1} / ${totalItems}`));
  lines.push('');
  return lines;
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

async function runOneProblem(problem: HumanEvalProblem, model: string, rl?: Interface): Promise<RunResult> {
  const startMs = Date.now();
  const taskSlug = problem.task_id.replace(/\//g, '-');
  const runDir = join(HUMANEVAL_RUNS_DIR, taskSlug);
  mkdirSync(runDir, { recursive: true });
  resetEvalWorkDir(runDir);

  printEvalHeader(problem.task_id, buildAgentPrompt(problem));

  const handle = startEvalScenario(runDir, buildAgentPrompt(problem), model || undefined);

  let userCancelled = false;
  let promptingUser = false;
  let lastSeenTargetMs: number | null = null;

  const pollTimer = rl ? setInterval(() => {
    if (promptingUser) return;
    try {
      if (existsSync(handle.retryStatusFile)) {
        const raw = readFileSync(handle.retryStatusFile, 'utf-8').trim();
        if (raw) {
          const info = JSON.parse(raw) as { name: string; label: string; targetMs: number } | null;
          if (info !== null && info.targetMs !== lastSeenTargetMs) {
            lastSeenTargetMs = info.targetMs;
            promptingUser = true;
            const waitSec = Math.ceil((info.targetMs - Date.now()) / 1000);
            const label = waitSec > 0 ? ` (waiting ${waitSec}s)` : '';
            askContinuePrompt(rl, `Rate limit hit${label}. Continue?`).then(cont => {
              promptingUser = false;
              if (!cont) {
                userCancelled = true;
                handle.cancel();
              }
            }).catch(() => { promptingUser = false; });
          }
        }
      }
    } catch { /* ignore poll errors */ }
  }, 500) : null;

  const result = await handle.promise;
  if (pollTimer !== null) clearInterval(pollTimer);

  const evalModel = model || '';
  const colonIdx = evalModel.indexOf(':');
  if (colonIdx !== -1) setModelStatus(evalModel.slice(0, colonIdx), evalModel.slice(colonIdx + 1));
  else if (evalModel) setModelStatus('', evalModel);
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

export async function runHumanEvalMenu(
  rl: Interface,
  _projectRoot: string,
  getSelectedModel: () => string,
  _downloadFn: (url: string, dest: string) => Promise<void> = downloadFile,
): Promise<void> {
  await ensureStoreReady();
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const dataPath = process.env['HUMANEVAL_DATA'] ?? HUMANEVAL_DATA_DEFAULT;
    if (!existsSync(dataPath)) {
      process.stdout.write(chalk.cyan('Downloading HumanEval dataset...'));
      try {
        await _downloadFn(HUMANEVAL_DOWNLOAD_URL, dataPath);
        process.stdout.write(chalk.green(' done\n'));
      } catch (err) {
        process.stdout.write(chalk.red(` failed\n`));
        console.log(chalk.red(`Could not download dataset: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }
    }

    let problems: HumanEvalProblem[];
    try {
      problems = readProblems();
    } catch (err) {
      console.log(chalk.red(`Failed to load HumanEval dataset: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    const model = getSelectedModel();
    const results: HumanEvalResultMap = getHumanEvalResults(model);

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
        const totalItems = 1 + problems.length;
        if (key === '\x1b') { close(null); return; }
        if (key === '\x1b[A') {
          sel = (sel - 1 + totalItems) % totalItems;
          viewportStart = clampViewport(sel, viewportStart);
          redraw(); return;
        }
        if (key === '\x1b[B') {
          sel = (sel + 1) % totalItems;
          viewportStart = clampViewport(sel, viewportStart);
          redraw(); return;
        }
        if (key === '\r' || key === '\n') {
          close(sel === 0 ? [...problems] : [problems[sel - 1]]);
          return;
        }
      },
    });

    if (!chosen) {
      if (process.stdin.isTTY) redrawBanner();
      return;
    }

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
