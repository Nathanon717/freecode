import { existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import type { EvalRunResult, EvalReport, CheckResult, ToolCall } from '../../shared/types.js';
import {
  assertFileExists,
  assertNoUnnecessaryTools,
  assertStayedInWorkDir,
  statToolCalls,
  statTokens,
} from '../../shared/assertions.js';

const expectedOutput = 'count=3\ntotal=16\naverage=5.33\n';

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

type ScriptRunResult =
  | { ok: true; stdout: string; command: string }
  | { ok: false; message: string };

function runScript(workDir: string): ScriptRunResult {
  const scriptPath = join(workDir, 'analyze_numbers.py');
  if (!existsSync(scriptPath)) {
    return { ok: false, message: 'analyze_numbers.py does not exist' };
  }

  const candidates = [
    { command: 'python', args: [scriptPath] },
    { command: 'py', args: ['-3', scriptPath] },
    { command: 'python3', args: [scriptPath] },
  ];

  const failures: string[] = [];
  for (const candidate of candidates) {
    const run = spawnSync(candidate.command, candidate.args, {
      cwd: workDir,
      encoding: 'utf-8',
      windowsHide: true,
    });
    if (run.error) {
      failures.push(`${candidate.command}: ${run.error.message}`);
      continue;
    }
    if (run.status !== 0) {
      return { ok: false, message: `${candidate.command} exited ${run.status}; stderr=${JSON.stringify(run.stderr)}` };
    }
    return { ok: true, stdout: normalizeNewlines(run.stdout), command: candidate.command };
  }

  return { ok: false, message: `no Python executable available (${failures.join('; ')})` };
}

function assertScriptRuns(workDir: string): CheckResult {
  const result = runScript(workDir);
  return {
    name: 'script runs',
    kind: 'assertion',
    pass: result.ok,
    message: result.ok ? undefined : result.message,
  };
}

function assertCorrectOutput(workDir: string): CheckResult {
  const result = runScript(workDir);
  if (!result.ok) {
    return { name: 'correct output', kind: 'assertion', pass: false, message: result.message };
  }
  const pass = result.stdout === expectedOutput;
  return {
    name: 'correct output',
    kind: 'assertion',
    pass,
    message: pass ? undefined : `stdout=${JSON.stringify(result.stdout)} expected=${JSON.stringify(expectedOutput)}`,
  };
}

function commandMentionsScript(call: ToolCall): boolean {
  const command = call.args.command;
  return typeof command === 'string' && command.includes('analyze_numbers.py');
}

function pathTargetsScript(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'analyze_numbers.py' || normalized.endsWith('/analyze_numbers.py');
}

function resultText(call: ToolCall): string {
  return typeof call.result === 'string' ? call.result : JSON.stringify(call.result ?? '');
}

function assertRanFailedThenFixed(toolCalls: ToolCall[]): CheckResult {
  const failingRun = toolCalls.findIndex(call =>
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('SyntaxError')
  );

  if (failingRun === -1) {
    return {
      name: 'ran failing script first',
      kind: 'warning',
      pass: false,
      message: 'no shell_exec of analyze_numbers.py captured the initial SyntaxError',
    };
  }

  const editAfterFailure = toolCalls.findIndex((call, index) =>
    index > failingRun &&
    (call.tool === 'write_file' || call.tool === 'edit_file') &&
    pathTargetsScript(call)
  );

  if (editAfterFailure === -1) {
    return {
      name: 'edited after inspecting failure',
      kind: 'assertion',
      pass: false,
      message: 'no edit to analyze_numbers.py happened after the failing run',
    };
  }

  const passingRun = toolCalls.findIndex((call, index) =>
    index > editAfterFailure &&
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('count=3') &&
    resultText(call).includes('total=16') &&
    resultText(call).includes('average=5.33')
  );

  return {
    name: 'reran fixed script',
    kind: 'assertion',
    pass: passingRun !== -1,
    message: passingRun === -1 ? 'no successful rerun of analyze_numbers.py after the edit was captured' : undefined,
  };
}

export function check(result: EvalRunResult): EvalReport {
  return {
    scenarioId: '003-python-missing-semicolon',
    checks: [
      assertFileExists(result.workDir, 'analyze_numbers.py'),
      assertScriptRuns(result.workDir),
      assertCorrectOutput(result.workDir),
      assertRanFailedThenFixed(result.toolCalls),
      assertNoUnnecessaryTools(result.toolCalls, ['read_file', 'write_file', 'edit_file', 'shell_exec', 'list_dir']),
      assertStayedInWorkDir(result.toolCalls, result.workDir),
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
