import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import type { EvalRunResult, ToolCall, AgentRunEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const DIST_ENTRY = join(ROOT, 'dist', 'index.js');

export function resetWorkDir(scenarioDir: string): void {
  const startDir = join(scenarioDir, 'start');
  const workDir = join(scenarioDir, 'work');

  if (existsSync(workDir)) {
    rmSync(workDir, { recursive: true, force: true });
  }
  mkdirSync(workDir, { recursive: true });

  if (existsSync(startDir)) {
    const entries = readdirSync(startDir).filter(f => f !== '.gitkeep');
    if (entries.length > 0) {
      cpSync(startDir, workDir, { recursive: true, filter: (src) => !src.endsWith('.gitkeep') });
    }
  }
}

export function runScenario(scenarioDir: string, prompt: string): EvalRunResult {
  const workDir = join(scenarioDir, 'work');
  const traceFile = join(workDir, '.eval-trace.json');
  const resultFile = join(workDir, '.eval-result.json');
  const scriptFile = join(workDir, '.eval-script.txt');

  // Prompt + generous buffer of 'y' approvals so all tool calls are accepted
  const script = [prompt, ...Array(30).fill('y')].join('\n');
  writeFileSync(scriptFile, script, 'utf-8');

  const proc = spawnSync(process.execPath, [DIST_ENTRY, '--script', scriptFile], {
    cwd: workDir,
    env: {
      ...process.env,
      FREECODE_TRACE_JSON: traceFile,
      FREECODE_RESULT_JSON: resultFile,
      DEBUG_QUOTA: '0',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    timeout: 120_000,
    encoding: 'utf-8',
  });

  let toolCalls: ToolCall[] = [];
  if (existsSync(traceFile)) {
    try { toolCalls = JSON.parse(readFileSync(traceFile, 'utf-8')); } catch {}
  }

  let agentResults: AgentRunEntry[] = [];
  if (existsSync(resultFile)) {
    try { agentResults = JSON.parse(readFileSync(resultFile, 'utf-8')); } catch {}
  }

  const totalTokens = agentResults.reduce((s, r) => s + (r.totalTokens ?? 0), 0);
  const hasPrompt = agentResults.some(r => r.promptTokens !== undefined);
  const hasOutput = agentResults.some(r => r.outputTokens !== undefined);

  return {
    exitCode: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    toolCalls,
    tokens: {
      total: totalTokens,
      prompt: hasPrompt ? agentResults.reduce((s, r) => s + (r.promptTokens ?? 0), 0) : undefined,
      output: hasOutput ? agentResults.reduce((s, r) => s + (r.outputTokens ?? 0), 0) : undefined,
    },
    workDir,
  };
}
