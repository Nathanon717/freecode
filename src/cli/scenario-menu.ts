import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
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
import { loadCanonicalGroups, type CanonicalModelGroups } from '../providers/canonical-models.js';
import {
  PLAYGROUND_EVAL_DIR,
  EVAL_RESULTS_DIR,
  modelSlug,
  modelResultFile,
  loadModelResults,
  loadEvalHistory,
  discoverPlaygroundScenarios,
  computeRunHash,
  computeScenarioHash,
  getEvalStatus,
  getLatestEvalEntry,
  statusCircle,
  type EvalCheckResult,
  type EvalHistoryEntry,
  type PlaygroundScenario,
  type ScenarioHashes,
} from './eval-dots.js';
export { getEvalStatus };

import { isBottomUIActive, setEvalRunning, setModelStatus, setQuotaSnapshot, setRetryBanner, setTokenCount, setupBottomUI, teardownBottomUI } from './terminal-ui.js';
import { countWrappedLines, runRawPicker } from './raw-picker.js';
import { logError } from '../logger.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const DIST_ENTRY = resolve(_dirname, '..', '..', 'dist', 'index.js');
const TSX_CLI = resolve(_dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const RUN_CHECK_SCRIPT = resolve(_dirname, '..', '..', 'playground', 'eval', 'run-check.ts');

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

// Eval types (structural mirror of playground/eval/shared/types.ts)
interface EvalToolCall { tool: string; args: Record<string, unknown>; result?: unknown; }
interface EvalTokenUsage { total: number; prompt?: number; output?: number; }
interface EvalRunResult {
  exitCode: number; stdout: string; stderr: string;
  toolCalls: EvalToolCall[]; tokens: EvalTokenUsage; workDir: string;
  quota: unknown;
}
interface EvalReport { scenarioId: string; checks: EvalCheckResult[]; }

function appendEvalHistory(entry: EvalHistoryEntry): void {
  mkdirSync(EVAL_RESULTS_DIR, { recursive: true });
  const existing = loadModelResults(entry.model);
  const latest = existing.filter(e =>
    e.scenarioId !== entry.scenarioId ||
    e.model !== entry.model ||
    e.scenarioHash !== entry.scenarioHash,
  );
  latest.push(entry);
  writeFileSync(modelResultFile(entry.model), JSON.stringify(latest, null, 2) + '\n', 'utf-8');
}

function archiveEvalRun(scenarioDir: string, model: string, result: EvalRunResult): void {
  const slug = modelSlug(model || 'default');
  const artifactsDir = join(scenarioDir, '.artifacts', slug);
  const artifactWorkDir = join(artifactsDir, 'work');
  mkdirSync(artifactWorkDir, { recursive: true });
  if (existsSync(result.workDir)) {
    cpSync(result.workDir, artifactWorkDir, { recursive: true });
  }
  const archived = { ...result, workDir: artifactWorkDir };
  writeFileSync(join(artifactsDir, 'result.json'), JSON.stringify(archived, null, 2) + '\n', 'utf-8');
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
  try { return JSON.parse(readFileSync(configPath, 'utf-8')) as EvalConfig; } catch (err) {
    logError('eval', `Failed to parse eval.config.json in ${scenarioDir}`, err);
    return {};
  }
}

interface CancellableEval {
  promise: Promise<EvalRunResult>;
  cancel: () => void;
  retryStatusFile: string;
  resultFile: string;
}

function startEvalScenario(scenarioDir: string, prompt: string, model?: string): CancellableEval {
  const workDir = join(scenarioDir, 'work');
  const runDir = join(scenarioDir, '.run');
  mkdirSync(runDir, { recursive: true });
  const traceFile = join(runDir, 'trace.json');
  const resultFile = join(runDir, 'result.json');
  const retryStatusFile = join(runDir, 'retry-status.json');
  const scriptFile = join(runDir, 'script.txt');
  writeFileSync(scriptFile, prompt, 'utf-8');

  const evalConfig = loadEvalConfig(scenarioDir);
  const maxToolCalls = evalConfig.maxToolCalls ?? 10;

  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  let headerSkipped = false;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  if (!existsSync(DIST_ENTRY)) {
    throw new Error(`dist/index.js not found — run \`npm run build\` before running evals`);
  }

  let killProc: () => void = () => {};

  const exitCodePromise = new Promise<number>((resolve) => {
    const proc = spawn(process.execPath, [DIST_ENTRY, '--script', scriptFile], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(model ? { FREECODE_MODEL: model } : {}),
        FREECODE_TRACE_JSON: traceFile,
        FREECODE_TRANSCRIPT_STREAM: 'stdout',
        FREECODE_RESULT_JSON: resultFile,
        FREECODE_RETRY_STATUS_FILE: retryStatusFile,
        FREECODE_AUTO_CONFIRM: '1',
        FREECODE_MAX_TOOL_CALLS: String(maxToolCalls),
        FORCE_COLOR: '1',
        COLUMNS: String(process.stdout.columns || 80),
      },
    });
    proc.stdin?.end();

    killProc = () => proc.kill();

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
      const exitCode = code ?? 1;
      if (exitCode !== 0 && stderrChunks.length > 0) {
        const stderrText = stderrChunks.join('').trim();
        if (stderrText) process.stderr.write(chalk.red(`\n[agent stderr]\n${stderrText}\n`));
      }
      resolve(exitCode);
    });
  });

  const promise: Promise<EvalRunResult> = exitCodePromise.then((exitCode) => {
    let toolCalls: EvalToolCall[] = [];
    if (existsSync(traceFile)) {
      try { toolCalls = JSON.parse(readFileSync(traceFile, 'utf-8')) as EvalToolCall[]; } catch (err) {
        logError('eval', `Failed to parse trace file ${traceFile}`, err);
      }
    }

    interface AgentEntry { totalTokens: number; promptTokens?: number; outputTokens?: number; quota?: unknown; }
    let agentResults: AgentEntry[] = [];
    if (existsSync(resultFile)) {
      try { agentResults = JSON.parse(readFileSync(resultFile, 'utf-8')) as AgentEntry[]; } catch (err) {
        logError('eval', `Failed to parse result file ${resultFile}`, err);
      }
    }

    const totalTokens = agentResults.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
    const hasPrompt = agentResults.some(r => r.promptTokens !== undefined);
    const hasOutput = agentResults.some(r => r.outputTokens !== undefined);
    const lastQuota = [...agentResults].reverse().find(r => r.quota !== undefined)?.quota ?? null;

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
      quota: lastQuota,
    };
  });

  return { promise, cancel: () => killProc(), retryStatusFile, resultFile };
}

function printEvalReport(report: EvalReport): void {
  const assertions = report.checks.filter(c => c.kind === 'assertion');
  const warnings = report.checks.filter(c => c.kind === 'warning');
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
    if (!check.pass && check.message) {
      for (const line of check.message.split('\n')) console.log(`     ${chalk.red(line)}`);
    }
  }

  const firedWarnings = warnings.filter(c => !c.pass);
  if (firedWarnings.length > 0) {
    console.log(chalk.hex('#FFA500')('\n  Warnings:'));
    for (const w of firedWarnings) {
      const text = w.message ?? w.name;
      for (const line of text.split('\n')) console.log(chalk.hex('#FFA500')(`    ! ${line}`));
    }
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

function buildEvalPickerScreen(
  scenarios: PlaygroundScenario[],
  selected: number,
  history: EvalHistoryEntry[],
  model: string,
  scenarioHashes: Map<string, ScenarioHashes>,
  groups: CanonicalModelGroups,
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Eval scenarios')}`);
  lines.push(`  ${chalk.dim('Up/Down navigate, Enter run, a run all, → details, Esc close')}`);
  lines.push('');
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const active = i === selected;
    const cursor = active ? chalk.cyan('>') : ' ';
    const label = active ? chalk.inverse(s.id) : chalk.cyan(s.id);
    const h = scenarioHashes.get(s.id);
    const circle = statusCircle(getEvalStatus(s.id, h?.runHash ?? '', model, history, groups, h?.fullHash));
    lines.push(`  ${cursor} ${circle} ${label}  ${chalk.dim(s.firstLine)}`);
  }
  lines.push('');
  return lines;
}

function buildEvalDetailScreen(
  scenario: PlaygroundScenario,
  entry: EvalHistoryEntry | null,
  model: string,
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan(scenario.id)}`);
  lines.push(`  ${chalk.dim('← / Esc back')}`);
  lines.push('');

  if (!entry) {
    lines.push(`  ${chalk.gray('No results yet')}`);
    lines.push('');
    return lines;
  }

  const checks = entry.checks;
  if (!checks || checks.length === 0) {
    const badge = entry.pass ? chalk.green('PASS') : chalk.red('FAIL');
    lines.push(`  ${badge}  ${chalk.dim(entry.timestamp.slice(0, 10))}  ${chalk.dim(model)}`);
    lines.push(`  ${chalk.gray('(run again to capture grading details)')}`);
    lines.push('');
    return lines;
  }

  const assertions = checks.filter(c => c.kind === 'assertion');
  const warnings = checks.filter(c => c.kind === 'warning');
  const stats = checks.filter(c => c.kind === 'stat');
  const passed = assertions.filter(c => c.pass).length;
  const total = assertions.length;
  const allPassed = passed === total;

  const badge = allPassed ? chalk.green('PASS') : chalk.red('FAIL');
  lines.push(`  ${badge}  (${passed}/${total} assertions)  ${chalk.dim(entry.timestamp.slice(0, 10))}  ${chalk.dim(model)}`);
  lines.push('');

  for (const check of assertions) {
    const icon = check.pass ? chalk.green('✓') : chalk.red('✗');
    const name = check.pass ? chalk.dim(check.name) : check.name;
    lines.push(`    ${icon}  ${name}`);
    if (!check.pass && check.message) {
      for (const line of check.message.split('\n')) lines.push(`       ${chalk.red(line)}`);
    }
  }

  const firedWarnings = warnings.filter(c => !c.pass);
  if (firedWarnings.length > 0) {
    lines.push('');
    lines.push(chalk.hex('#FFA500')('  Warnings:'));
    for (const w of firedWarnings) {
      const text = w.message ?? w.name;
      for (const line of text.split('\n')) lines.push(chalk.hex('#FFA500')(`    ! ${line}`));
    }
  }

  if (stats.length > 0) {
    lines.push('');
    lines.push(chalk.dim('  Stats:'));
    for (const stat of stats) {
      lines.push(chalk.dim(`    ${stat.name}: ${stat.note ?? String(stat.value ?? '')}`));
    }
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

    const evalHistory = loadEvalHistory();
    const canonicalGroups = loadCanonicalGroups();
    const scenarioHashes = new Map(scenarios.map(s => {
      const dir = join(PLAYGROUND_EVAL_DIR, s.id);
      return [s.id, { runHash: computeRunHash(dir), fullHash: computeScenarioHash(dir) }];
    }));

    if (!process.stdin.isTTY) {
      console.log(chalk.bold('Eval scenarios\n'));
      const model = getSelectedModel();
      for (const s of scenarios) {
        const h = scenarioHashes.get(s.id);
        const circle = statusCircle(getEvalStatus(s.id, h?.runHash ?? '', model, evalHistory, canonicalGroups, h?.fullHash));
        console.log(`  ${circle} ${chalk.cyan(s.id)}  ${chalk.gray(s.firstLine)}`);
      }
      return;
    }
    // ── Raw-mode list picker ──────────────────────────────────────────────
    let pickerSel = 0;
    let detailMode = false;

    const chosen = await runRawPicker<PlaygroundScenario[] | null>(rl, {
      render: () => {
        if (detailMode) {
          const s = scenarios[pickerSel];
          const h = scenarioHashes.get(s.id);
          const entry = getLatestEvalEntry(s.id, h?.runHash ?? '', getSelectedModel(), evalHistory, canonicalGroups, h?.fullHash);
          return buildEvalDetailScreen(s, entry, getSelectedModel());
        }
        return buildEvalPickerScreen(scenarios, pickerSel, evalHistory, getSelectedModel(), scenarioHashes, canonicalGroups);
      },
      countLines: countWrappedLines,
      onKey(key, redraw, close) {
        if (detailMode) {
          if (key === '\x1b' || key === '\x1b[D') { detailMode = false; redraw(); return; }
          return;
        }
        if (key === '\x1b') { close(null); return; }
        if (key === '\x1b[A') { pickerSel = (pickerSel - 1 + scenarios.length) % scenarios.length; redraw(); return; }
        if (key === '\x1b[B') { pickerSel = (pickerSel + 1) % scenarios.length; redraw(); return; }
        if (key === '\x1b[C') { detailMode = true; redraw(); return; }
        if (key === '\r' || key === '\n') { close([scenarios[pickerSel]]); return; }
        if (key === 'a' || key === 'A') { close([...scenarios]); return; }
      },
    });

    if (!chosen) return;

    const model = getSelectedModel();

    // ── Run ───────────────────────────────────────────────────────────────
    let passed = 0;
    let failed = 0;
    let incomplete = 0;

    for (const scenario of chosen) {
      const scenarioDir = join(PLAYGROUND_EVAL_DIR, scenario.id);
      const promptPath = join(scenarioDir, 'prompt.md');
      const checkPath = join(scenarioDir, 'eval', 'check.ts');

      if (!existsSync(promptPath) || !existsSync(checkPath)) {
        console.log(chalk.yellow(`SKIP  ${scenario.id}  (missing prompt.md or eval/check.ts)`));
        continue;
      }

      const prompt = readFileSync(promptPath, 'utf-8').trim();

      const termWidth = process.stdout.columns || 80;
      const headerPrefix = '── ';
      const headerSuffix = ' ';
      const dashCount = Math.max(2, termWidth - headerPrefix.length - scenario.id.length - headerSuffix.length);
      console.log(chalk.bold.cyan(`\n${headerPrefix}${scenario.id}${headerSuffix}${'─'.repeat(dashCount)}`));
      console.log(chalk.bold('Prompt:'));
      console.log(chalk.white(prompt));

      resetEvalWorkDir(scenarioDir);
      setEvalRunning(scenario.id);
      const maxToolCalls = loadEvalConfig(scenarioDir).maxToolCalls ?? 10;
      let result: EvalRunResult;
      const handle = startEvalScenario(scenarioDir, prompt, model || undefined);

      // Poll result.json and retry-status.json every 500ms so the footer reflects
      // live quota/token counts and the rate-limit cooldown banner during the run.
      const liveStatusPoll = setInterval(() => {
        try {
          if (existsSync(handle.retryStatusFile)) {
            const raw = readFileSync(handle.retryStatusFile, 'utf-8').trim();
            if (raw) setRetryBanner(JSON.parse(raw) as { name: string; label: string; targetMs: number } | null);
          }
        } catch (err) { process.stderr.write(`[poll] retry status read failed: ${String(err)}\n`); }
        try {
          if (existsSync(handle.resultFile)) {
            interface AgentEntry { totalTokens?: number; providerId?: string; modelId?: string; quota?: unknown; }
            const entries = JSON.parse(readFileSync(handle.resultFile, 'utf-8')) as AgentEntry[];
            const last = entries[entries.length - 1];
            if (last) {
              if (last.totalTokens !== undefined) setTokenCount(last.totalTokens);
              if (last.providerId && last.modelId) setModelStatus(last.providerId, last.modelId);
              else if (last.modelId) setModelStatus('', last.modelId);
              if (Array.isArray(last.quota)) setQuotaSnapshot(last.quota);
            }
          }
        } catch (err) { process.stderr.write(`[poll] result file read failed: ${String(err)}\n`); }
      }, 500);

      try {
        result = await handle.promise;
      } finally {
        clearInterval(liveStatusPoll);
        setEvalRunning(null);
        setRetryBanner(null);
      }

      // Update footer with the model, token count, and quota from the eval run.
      const evalModel = model || '';
      const colonIdx = evalModel.indexOf(':');
      if (colonIdx !== -1) setModelStatus(evalModel.slice(0, colonIdx), evalModel.slice(colonIdx + 1));
      else if (evalModel) setModelStatus('', evalModel);
      setTokenCount(result.tokens.total);
      setQuotaSnapshot(Array.isArray(result.quota) ? result.quota : null);

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

      if (result.exitCode !== 0) {
        console.log(chalk.yellow(`\nINCOMPLETE  ${chalk.bold(scenario.id)}  (agent did not finish — circle status unchanged)`));
        const reason = result.exitCode === 1 && result.toolCalls.length >= maxToolCalls
          ? `exit ${result.exitCode} — hit the ${maxToolCalls}-tool-call limit without finishing`
          : `exit ${result.exitCode}`;
        console.log(chalk.yellow(`  reason: ${reason}`));
        console.log(chalk.yellow(`  tool calls: ${result.toolCalls.length}${maxToolCalls ? `/${maxToolCalls}` : ''}`));

        const stripAnsiText = (s: string) => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        const tail = (text: string, n: number): string =>
          stripAnsiText(text).split('\n').filter(l => l.trim()).slice(-n).join('\n');

        const stderrTail = tail(result.stderr, 20);
        if (stderrTail) {
          console.log(chalk.red('  stderr (last 20 lines):'));
          for (const line of stderrTail.split('\n')) console.log(chalk.red(`    ${line}`));
        }

        const lastCall = result.toolCalls[result.toolCalls.length - 1];
        if (lastCall) {
          const lastResult = typeof lastCall.result === 'string'
            ? lastCall.result
            : JSON.stringify(lastCall.result ?? '');
          console.log(chalk.yellow(`  last tool: ${lastCall.tool}(${JSON.stringify(lastCall.args)})`));
          if (lastResult) console.log(chalk.yellow(`    → ${lastResult.split('\n').slice(0, 3).join(' ⏎ ')}`));
        }

        if (!stderrTail) {
          const stdoutTail = tail(result.stdout, 10);
          if (stdoutTail) {
            console.log(chalk.dim('  stdout (last 10 lines):'));
            for (const line of stdoutTail.split('\n')) console.log(chalk.dim(`    ${line}`));
          }
        }

        incomplete++;
        continue;
      }

      const resultInputPath = join(scenarioDir, '.run', 'result-input.json');
      writeFileSync(resultInputPath, JSON.stringify(result));
      const checkProc = spawnSync(
        process.execPath,
        [TSX_CLI, RUN_CHECK_SCRIPT, checkPath, resultInputPath],
        { encoding: 'utf-8', timeout: 30_000 },
      );
      if (checkProc.error || !checkProc.stdout?.trim()) {
        const detail = checkProc.error?.message ?? checkProc.stderr?.trim() ?? `exit ${checkProc.status}`;
        throw new Error(`check script failed for ${scenario.id}: ${detail}`);
      }
      const report = JSON.parse(checkProc.stdout) as EvalReport;

      const allPassed = report.checks.filter(c => c.kind === 'assertion').every(c => c.pass);
      const hasWarnings = report.checks.some(c => c.kind === 'warning' && !c.pass);

      printEvalReport(report);

      archiveEvalRun(scenarioDir, model, result);

      appendEvalHistory({
        timestamp: new Date().toISOString(),
        scenarioId: scenario.id,
        model: model || 'default',
        pass: allPassed,
        warnings: allPassed && hasWarnings,
        tokens: result.tokens,
        scenarioHash: computeRunHash(scenarioDir),
        checks: report.checks,
      });

      if (allPassed) passed++; else failed++;
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
