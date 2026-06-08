import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import {
  PLAYGROUND_EVAL_DIR,
  EVAL_RESULTS_DIR,
  modelSlug,
  modelResultFile,
  loadModelResults,
  type EvalCheckResult,
  type EvalHistoryEntry,
} from './eval-dots.js';
import { logError } from '../logger.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const DIST_ENTRY = resolve(_dirname, '..', '..', 'dist', 'index.js');
const TSX_CLI = resolve(_dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const RUN_CHECK_SCRIPT = resolve(_dirname, '..', '..', 'playground', 'eval', 'run-check.ts');

export interface EvalToolCall { tool: string; args: Record<string, unknown>; result?: unknown; }
export interface EvalTokenUsage { total: number; prompt?: number; output?: number; }
export interface EvalRunResult {
  exitCode: number; stdout: string; stderr: string;
  toolCalls: EvalToolCall[]; tokens: EvalTokenUsage; workDir: string;
  quota: unknown;
}
export interface EvalReport { scenarioId: string; checks: EvalCheckResult[]; }

interface EvalConfig {
  maxToolCalls?: number;
}

export function loadEvalConfig(scenarioDir: string): EvalConfig {
  const configPath = join(scenarioDir, 'eval.config.json');
  if (!existsSync(configPath)) return {};
  try { return JSON.parse(readFileSync(configPath, 'utf-8')) as EvalConfig; } catch (err) {
    logError('eval', `Failed to parse eval.config.json in ${scenarioDir}`, err);
    return {};
  }
}

export function appendEvalHistory(entry: EvalHistoryEntry): void {
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

export function archiveEvalRun(scenarioDir: string, model: string, result: EvalRunResult): void {
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

export function resetEvalWorkDir(scenarioDir: string): void {
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

interface CancellableEval {
  promise: Promise<EvalRunResult>;
  cancel: () => void;
  retryStatusFile: string;
  resultFile: string;
}

export function startEvalScenario(scenarioDir: string, prompt: string, model?: string): CancellableEval {
  const workDir = join(scenarioDir, 'work');
  const runDir = join(scenarioDir, '.run');
  mkdirSync(runDir, { recursive: true });
  const traceFile = join(runDir, 'trace.json');
  const resultFile = join(runDir, 'result.json');
  const retryStatusFile = join(runDir, 'retry-status.json');
  const scriptFile = join(runDir, 'script.txt');
  writeFileSync(scriptFile, JSON.stringify(prompt) + '\n', 'utf-8');

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

export function runCheckScript(scenarioId: string, scenarioDir: string, result: EvalRunResult): EvalReport {
  const resultInputPath = join(scenarioDir, '.run', 'result-input.json');
  const checkPath = join(scenarioDir, 'eval', 'check.ts');
  writeFileSync(resultInputPath, JSON.stringify(result));
  const checkProc = spawnSync(
    process.execPath,
    [TSX_CLI, RUN_CHECK_SCRIPT, checkPath, resultInputPath],
    { encoding: 'utf-8', timeout: 30_000 },
  );
  if (checkProc.error || !checkProc.stdout?.trim()) {
    const detail = checkProc.error?.message ?? checkProc.stderr?.trim() ?? `exit ${checkProc.status}`;
    throw new Error(`check script failed for ${scenarioId}: ${detail}`);
  }
  return JSON.parse(checkProc.stdout) as EvalReport;
}
