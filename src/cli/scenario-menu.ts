import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'fs';
import { join, resolve, dirname, relative } from 'path';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import type { Interface } from 'readline';
import chalk from 'chalk';
import {
  findScenario,
  getScenarioSummaries,
  runScenario,
  type TestScenarioSummary,
} from './scenario-catalog.js';

import { isBottomUIActive, setupBottomUI, teardownBottomUI } from './terminal-ui.js';
import { runRawPicker } from './raw-picker.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_EVAL_DIR = resolve(_dirname, '..', '..', 'playground', 'eval');
const DIST_ENTRY = resolve(_dirname, '..', '..', 'dist', 'index.js');
const TSX_BIN = resolve(_dirname, '..', '..', 'node_modules', '.bin', 'tsx.cmd');
const RUN_CHECK_SCRIPT = resolve(_dirname, '..', '..', 'playground', 'eval', 'run-check.ts');
const EVAL_HISTORY_FILE = resolve(_dirname, '..', '..', 'playground', 'eval', 'eval-history.json');

// Eval types (structural mirror of playground/eval/shared/types.ts)
interface EvalToolCall { tool: string; args: Record<string, unknown>; }
interface EvalTokenUsage { total: number; prompt?: number; output?: number; }
interface EvalRunResult {
  exitCode: number; stdout: string; stderr: string;
  toolCalls: EvalToolCall[]; tokens: EvalTokenUsage; workDir: string;
}
interface EvalCheckResult {
  name: string; kind: 'assertion' | 'stat';
  pass?: boolean; message?: string; value?: string | number; note?: string;
}
interface EvalReport { scenarioId: string; checks: EvalCheckResult[]; }

interface EvalHistoryEntry {
  timestamp: string;
  scenarioId: string;
  model: string;
  pass: boolean;
  tokens: EvalTokenUsage;
}

function appendEvalHistory(entry: EvalHistoryEntry): void {
  let history: EvalHistoryEntry[] = [];
  if (existsSync(EVAL_HISTORY_FILE)) {
    try { history = JSON.parse(readFileSync(EVAL_HISTORY_FILE, 'utf-8')); } catch {}
  }
  history.push(entry);
  writeFileSync(EVAL_HISTORY_FILE, JSON.stringify(history, null, 2) + '\n', 'utf-8');
}

interface PlaygroundScenario {
  id: string;
  firstLine: string;
}

function discoverPlaygroundScenarios(): PlaygroundScenario[] {
  if (!existsSync(PLAYGROUND_EVAL_DIR)) return [];
  return readdirSync(PLAYGROUND_EVAL_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{3}-/.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(d => {
      const dir = join(PLAYGROUND_EVAL_DIR, d.name);
      return existsSync(join(dir, 'prompt.md')) && existsSync(join(dir, 'eval', 'check.ts'));
    })
    .map(d => {
      const promptPath = join(PLAYGROUND_EVAL_DIR, d.name, 'prompt.md');
      const firstLine = readFileSync(promptPath, 'utf-8').trim().split('\n')[0].slice(0, 80);
      return { id: d.name, firstLine };
    });
}

function resetEvalWorkDir(scenarioDir: string): void {
  const startDir = join(scenarioDir, 'start');
  const workDir = join(scenarioDir, 'work');
  const runDir = join(scenarioDir, '.run');
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  if (existsSync(runDir)) rmSync(runDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  mkdirSync(runDir, { recursive: true });
  if (existsSync(startDir)) {
    const entries = readdirSync(startDir).filter(f => f !== '.gitkeep');
    if (entries.length > 0) {
      cpSync(startDir, workDir, { recursive: true, filter: (src: string) => !src.endsWith('.gitkeep') });
    }
  }
}

interface EvalConfig {
  maxToolCalls?: number;
}

function loadEvalConfig(scenarioDir: string): EvalConfig {
  const configPath = join(scenarioDir, 'eval.config.json');
  if (!existsSync(configPath)) return {};
  try { return JSON.parse(readFileSync(configPath, 'utf-8')) as EvalConfig; } catch { return {}; }
}

async function executeEvalScenario(scenarioDir: string, prompt: string, model?: string): Promise<EvalRunResult> {
  const workDir = join(scenarioDir, 'work');
  const runDir = join(scenarioDir, '.run');
  mkdirSync(runDir, { recursive: true });
  const traceFile = join(runDir, 'trace.json');
  const resultFile = join(runDir, 'result.json');
  const scriptFile = join(runDir, 'script.txt');
  writeFileSync(scriptFile, prompt, 'utf-8');

  const evalConfig = loadEvalConfig(scenarioDir);
  const maxToolCalls = evalConfig.maxToolCalls ?? 10;

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  let headerSkipped = false;
  let stdoutChunks: string[] = [];
  let stderrChunks: string[] = [];

  const exitCode = await new Promise<number>((resolve) => {
    const proc = spawn(process.execPath, [DIST_ENTRY, '--script', scriptFile], {
      cwd: workDir,
      env: {
        ...process.env,
        ...(model ? { FREECODE_MODEL: model } : {}),
        FREECODE_TRACE_JSON: traceFile,
        FREECODE_TRANSCRIPT_STREAM: 'stdout',
        FREECODE_RESULT_JSON: resultFile,
        FREECODE_AUTO_CONFIRM: '1',
        FREECODE_MAX_TOOL_CALLS: String(maxToolCalls),
        DEBUG_QUOTA: '0',
        FORCE_COLOR: '1',
      },
    });

    let partialLine = '';

    const handleChunk = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      stdoutChunks.push(text);
      const combined = partialLine + text;
      const lines = combined.split('\n');
      partialLine = lines.pop() ?? '';
      for (const line of lines) {
        if (!headerSkipped && stripAnsi(line).startsWith('> ')) continue;
        headerSkipped = true;
        process.stdout.write(line + '\n');
      }
    };

    proc.stdout.on('data', handleChunk);
    proc.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'));
    });

    const timer = setTimeout(() => { proc.kill(); resolve(1); }, 120_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (partialLine) {
        if (headerSkipped || !stripAnsi(partialLine).startsWith('> ')) {
          process.stdout.write(partialLine);
        }
      }
      resolve(code ?? 1);
    });
  });

  let toolCalls: EvalToolCall[] = [];
  if (existsSync(traceFile)) {
    try { toolCalls = JSON.parse(readFileSync(traceFile, 'utf-8')); } catch {}
  }

  interface AgentEntry { totalTokens: number; promptTokens?: number; outputTokens?: number; }
  let agentResults: AgentEntry[] = [];
  if (existsSync(resultFile)) {
    try { agentResults = JSON.parse(readFileSync(resultFile, 'utf-8')); } catch {}
  }

  const totalTokens = agentResults.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
  const hasPrompt = agentResults.some(r => r.promptTokens !== undefined);
  const hasOutput = agentResults.some(r => r.outputTokens !== undefined);

  return {
    exitCode,
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
    toolCalls,
    tokens: {
      total: totalTokens,
      prompt: hasPrompt ? agentResults.reduce((s, r) => s + (r.promptTokens ?? 0), 0) : undefined,
      output: hasOutput ? agentResults.reduce((s, r) => s + (r.outputTokens ?? 0), 0) : undefined,
    },
    workDir,
  };
}

function printEvalReport(report: EvalReport): void {
  const assertions = report.checks.filter(c => c.kind === 'assertion');
  const stats = report.checks.filter(c => c.kind === 'stat');
  const passed = assertions.filter(c => c.pass).length;
  const total = assertions.length;
  const allPassed = passed === total;

  const header = allPassed ? chalk.green('PASS') : chalk.red('FAIL');
  console.log(`\n${header}  ${chalk.bold(report.scenarioId)}  (${passed}/${total} assertions)`);

  for (const check of assertions) {
    const icon = check.pass ? chalk.green('✓') : chalk.red('✗');
    const name = check.pass ? chalk.dim(check.name) : check.name;
    console.log(`  ${icon}  ${name}`);
    if (!check.pass && check.message) console.log(`     ${chalk.red(check.message)}`);
  }

  if (stats.length > 0) {
    console.log(chalk.dim('\n  Stats:'));
    for (const stat of stats) {
      console.log(chalk.dim(`    ${stat.name}: ${stat.note ?? String(stat.value ?? '')}`));
    }
  }
}

async function askQuestion(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function printScenarioMenu(title: string, scenarios: TestScenarioSummary[], showDetails: boolean): void {
  console.log(chalk.bold(`${title}\n`));
  scenarios.forEach((scenario, idx) => {
    const marker = scenario.requiresLlm ? chalk.yellow('eval') : chalk.green('verify');
    const description = scenario.description ? chalk.gray(` - ${scenario.description}`) : '';
    console.log(`${String(idx + 1).padStart(2, ' ')}. ${chalk.cyan(scenario.name)} ${marker}${description}`);
    if (showDetails) {
      const checks = scenario.checks.length > 0 ? scenario.checks.join(', ') : 'no explicit assertions';
      console.log(chalk.gray(`    file: ${scenario.file} | workspace: ${scenario.workspace} | checks: ${checks}`));
    }
  });
}

export function printScriptedScenarioList(projectRoot: string): void {
  const scenarios = getScenarioSummaries(projectRoot).filter(s => !s.requiresLlm);
  console.log(chalk.bold('Verification scenarios\n'));
  for (const scenario of scenarios) {
    console.log(`${scenario.name} [verify]${scenario.description ? ` - ${scenario.description}` : ''}`);
  }
}

export async function runTestMenu(rl: Interface, projectRoot: string): Promise<void> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const scenarios = getScenarioSummaries(projectRoot).filter(s => !s.requiresLlm);
    if (scenarios.length === 0) {
      console.log(chalk.yellow('No non-LLM verification scenarios found at tests/scenarios/*.scenario.json'));
      return;
    }

    printScenarioMenu('Verification scenarios', scenarios, false);
    console.log(chalk.gray('\nEnter a number/name to run one scenario, or blank to cancel.'));

    const choice = (await askQuestion(rl, chalk.green('test> '))).trim();
    if (!choice) return;

    const selected = findScenario(scenarios, choice);

    if (!selected) {
      console.log(chalk.red(`Unknown verification scenario: ${choice}`));
      return;
    }

    console.log(chalk.dim(`Running ${selected.name}...\n`));
    const result = runScenario(projectRoot, selected.name);
    if (result.status === 0) {
      if (result.output.trim()) console.log(result.output.trimEnd());
      console.log(chalk.green(`\n${selected.name} passed.`));
    } else {
      if (result.output.trim()) console.log(result.output.trimEnd());
      console.log(chalk.red(`\n${selected.name} failed.`));
    }
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) setupBottomUI();
  }
}

interface ApiError {
  message: string;
  code?: string;
  type?: string;
  param?: string;
  failedGeneration?: string;
  diagnosis?: string;
}

function parseJsonAt(text: string, start: number): { json: Record<string, unknown>; end: number } | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1)) as unknown;
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? { json: parsed as Record<string, unknown>, end: i + 1 }
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function extractApiErrors(stdout: string): ApiError[] {
  const plain = stdout.replace(/\x1b\[[0-9;]*m/g, '');
  const errors: ApiError[] = [];
  const pattern = /Error:\s*(\{)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(plain)) !== null) {
    const parsed = parseJsonAt(plain, match.index + match[0].lastIndexOf('{'));
    if (!parsed) continue;
    const source = parsed.json['error'] && typeof parsed.json['error'] === 'object' && !Array.isArray(parsed.json['error'])
      ? parsed.json['error'] as Record<string, unknown>
      : parsed.json;
    const message = stringField(source, 'message');
    if (message) {
      const code = stringField(source, 'code');
      const failedGeneration = stringField(source, 'failed_generation') ?? stringField(parsed.json, 'failed_generation');
      errors.push({
        message,
        code,
        type: stringField(source, 'type'),
        param: stringField(source, 'param'),
        failedGeneration,
        diagnosis: code === 'tool_use_failed' && !failedGeneration && message.includes('failed_generation')
          ? 'provider rejected an invalid model tool/function call before Freecode could run a tool, and did not include the referenced failed_generation payload'
          : undefined,
      });
    }
    pattern.lastIndex = parsed.end;
  }
  return errors;
}

function buildEvalPickerScreen(scenarios: PlaygroundScenario[], selected: number): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Eval scenarios')}`);
  lines.push(`  ${chalk.dim('Up/Down navigate, Enter run, a run all, Esc close')}`);
  lines.push('');
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const active = i === selected;
    const cursor = active ? chalk.cyan('>') : ' ';
    const label = active ? chalk.inverse(s.id) : chalk.cyan(s.id);
    lines.push(`  ${cursor} ${label}  ${chalk.dim(s.firstLine)}`);
  }
  lines.push('');
  return lines;
}

export async function runEvalMenu(rl: Interface, projectRoot: string, getSelectedModel: () => string): Promise<void> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const scenarios = discoverPlaygroundScenarios();
    if (scenarios.length === 0) {
      console.log(chalk.yellow('No eval scenarios found in playground/eval/.'));
      return;
    }

    if (!process.stdin.isTTY) {
      console.log(chalk.bold('Eval scenarios\n'));
      for (const s of scenarios) {
        console.log(`  ${chalk.cyan(s.id)}  ${chalk.gray(s.firstLine)}`);
      }
      return;
    }

    // ── Raw-mode list picker ──────────────────────────────────────────────
    let pickerSel = 0;

    const chosen = await runRawPicker<PlaygroundScenario[] | null>(rl, {
      render: () => buildEvalPickerScreen(scenarios, pickerSel),
      onKey(key, redraw, close) {
        if (key === '\x1b') { close(null); return; }
        if (key === '\x1b[A') { pickerSel = (pickerSel - 1 + scenarios.length) % scenarios.length; redraw(); return; }
        if (key === '\x1b[B') { pickerSel = (pickerSel + 1) % scenarios.length; redraw(); return; }
        if (key === '\r' || key === '\n') { close([scenarios[pickerSel]]); return; }
        if (key === 'a' || key === 'A') { close([...scenarios]); return; }
      },
    });

    if (!chosen) return;

    // ── Confirmation ──────────────────────────────────────────────────────
    const model = getSelectedModel();
    const confirmed = await new Promise<boolean>((resolve) => {
      rl.pause();
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdout.write(
        chalk.yellow(`Run ${chosen.length} eval${chosen.length === 1 ? '' : 's'} using ${model || 'default model'}? `) +
        chalk.dim('enter to confirm, esc to cancel') + ' ',
      );

      const onKey = (data: string): void => {
        if (data === '\x03') { cleanup(); process.exit(0); }
        if (data === '\r' || data === '\n') { cleanup(); process.stdout.write('\n'); resolve(true); return; }
        if (data === '\x1b') { cleanup(); process.stdout.write('\n'); resolve(false); return; }
      };

      function cleanup(): void {
        process.stdin.removeListener('data', onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        rl.resume();
      }

      process.stdin.on('data', onKey);
    });

    if (!confirmed) {
      console.log(chalk.dim('Cancelled.'));
      return;
    }

    // ── Run ───────────────────────────────────────────────────────────────
    let passed = 0;
    let failed = 0;

    for (const scenario of chosen) {
      const scenarioDir = join(PLAYGROUND_EVAL_DIR, scenario.id);
      const workDir = join(scenarioDir, 'work');
      const relativeWorkDir = relative(projectRoot, workDir).replace(/\\/g, '/');
      const promptPath = join(scenarioDir, 'prompt.md');
      const checkPath = join(scenarioDir, 'eval', 'check.ts');

      if (!existsSync(promptPath) || !existsSync(checkPath)) {
        console.log(chalk.yellow(`SKIP  ${scenario.id}  (missing prompt.md or eval/check.ts)`));
        continue;
      }

      const prompt = readFileSync(promptPath, 'utf-8').trim();

      console.log(chalk.bold.cyan(`\n── ${scenario.id} ──────────────────────────────────────────`));
      console.log(chalk.gray(relativeWorkDir));
      console.log(chalk.bold('Prompt:'));
      console.log(chalk.white(prompt));
      console.log(chalk.dim('─'.repeat(60)));
      console.log('');

      resetEvalWorkDir(scenarioDir);
      const result = await executeEvalScenario(scenarioDir, prompt, model || undefined);

      if (!result.stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()) {
        console.log(chalk.dim('(no output)'));
      }

      const apiErrors = extractApiErrors(result.stdout);
      if (apiErrors.length > 0) {
        console.log(chalk.red.bold('\nModel API error:'));
        for (const err of apiErrors) {
          const label = err.code ?? err.type ?? 'error';
          console.log(chalk.red(`  [${label}] ${err.message}`));
          if (err.type) console.log(chalk.red(`    type: ${err.type}`));
          if (err.param) console.log(chalk.red(`    param: ${err.param}`));
          if (err.failedGeneration) console.log(chalk.red(`    failed_generation: ${err.failedGeneration}`));
          if (err.diagnosis) console.log(chalk.red(`    diagnosis: ${err.diagnosis}`));
        }
      }

      console.log(chalk.dim('─'.repeat(60)));

      const resultInputPath = join(scenarioDir, '.run', 'result-input.json');
      writeFileSync(resultInputPath, JSON.stringify(result));
      const checkProc = spawnSync(TSX_BIN, [RUN_CHECK_SCRIPT, checkPath, resultInputPath], {
        encoding: 'utf-8',
        timeout: 30_000,
        shell: true,
      });
      if (checkProc.error || !checkProc.stdout?.trim()) {
        const detail = checkProc.error?.message ?? checkProc.stderr?.trim() ?? `exit ${checkProc.status}`;
        throw new Error(`check script failed for ${scenario.id}: ${detail}`);
      }
      const report: EvalReport = JSON.parse(checkProc.stdout);

      const allPassed = report.checks.filter(c => c.kind === 'assertion').every(c => c.pass);

      printEvalReport(report);

      appendEvalHistory({
        timestamp: new Date().toISOString(),
        scenarioId: scenario.id,
        model: model || 'default',
        pass: allPassed,
        tokens: result.tokens,
      });

      if (allPassed) passed++; else failed++;
    }

    if (chosen.length > 1) {
      console.log('');
      const color = failed > 0 ? chalk.red : chalk.green;
      console.log(color(`Results: ${passed} passed, ${failed} failed`));
    }
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) setupBottomUI();
  }
}
