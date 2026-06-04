import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import type { EvalRunResult, EvalReport, CheckResult, ToolCall } from '../../shared/types.js';
import {
  assertFileExists,
  assertNoUnnecessaryTools,
  assertStayedInWorkDir,
  statToolCalls,
  statTokens,
  formatOutputDiff,
} from '../../shared/assertions.js';

// SCORES = [72, 85, 91, 68, 79, 88, 95, 74]
// count=8, sum=652, mean=81.5, median=(79+85)/2=82.0
// The prompt does not dictate the print labels, only that the caller match the
// module's return shape. Accept either the module's key names (sum/mean) or the
// caller's original display labels (total/average) — both are correct fixes.
const expectedOutputs = [
  'count=8\nsum=652\nmean=81.50\nmedian=82.00\n',
  'count=8\ntotal=652\naverage=81.50\nmedian=82.00\n',
];

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

type ScriptRunResult =
  | { ok: true; stdout: string; command: string }
  | { ok: false; message: string };

function runScript(workDir: string): ScriptRunResult {
  const scriptPath = join(workDir, 'pipeline.py');
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
  const pass = expectedOutputs.includes(result.stdout);
  return {
    name: 'correct output',
    kind: 'assertion',
    pass,
    message: pass
      ? undefined
      : formatOutputDiff(result.stdout, expectedOutputs[0]) + `\n  (${expectedOutputs.length} accepted variants)`,
  };
}

function commandMentionsPipeline(call: ToolCall): boolean {
  const command = call.args.command;
  return typeof command === 'string' && command.includes('pipeline.py');
}

function pathTargetsStats(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'stats.py' || normalized.endsWith('/stats.py');
}

function pathTargetsPipeline(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'pipeline.py' || normalized.endsWith('/pipeline.py');
}

function resultText(call: ToolCall): string {
  return typeof call.result === 'string' ? call.result : JSON.stringify(call.result ?? '');
}

function assertRanFailingScript(toolCalls: ToolCall[]): CheckResult {
  const failingRun = toolCalls.find(call =>
    call.tool === 'shell_exec' &&
    commandMentionsPipeline(call) &&
    resultText(call).includes('KeyError')
  );

  return {
    name: 'ran failing script first',
    kind: 'warning',
    pass: failingRun !== undefined,
    message: failingRun ? undefined : 'no shell_exec of pipeline.py captured the initial KeyError',
  };
}

function assertInspectedStatsModule(toolCalls: ToolCall[]): CheckResult {
  const inspected = toolCalls.some(call =>
    (call.tool === 'read_file' && pathTargetsStats(call)) ||
    resultText(call).includes('"sum"') ||
    resultText(call).includes("'sum'") ||
    resultText(call).includes('"mean"') ||
    resultText(call).includes("'mean'")
  );

  return {
    name: 'inspected stats module',
    kind: 'warning',
    pass: inspected,
    message: inspected ? undefined : 'no tool call shows the agent read stats.py to understand its return shape',
  };
}

function assertFixedCallerNotModule(workDir: string): CheckResult {
  const statsPath = join(workDir, 'stats.py');
  if (!existsSync(statsPath)) {
    return { name: 'preserved stats module', kind: 'assertion', pass: false, message: 'stats.py does not exist' };
  }
  const src = readFileSync(statsPath, 'utf-8');
  const hasSumKey = src.includes('"sum"') || src.includes("'sum'");
  const hasMeanKey = src.includes('"mean"') || src.includes("'mean'");
  const pass = hasSumKey && hasMeanKey;
  return {
    name: 'preserved stats module',
    kind: 'assertion',
    pass,
    message: pass
      ? undefined
      : `stats.py no longer uses the canonical keys — agent should have fixed pipeline.py instead (hasSumKey=${hasSumKey}, hasMeanKey=${hasMeanKey})`,
  };
}

function assertEditedPipelineThenReran(toolCalls: ToolCall[]): CheckResult {
  const failingRun = toolCalls.findIndex(call =>
    call.tool === 'shell_exec' &&
    commandMentionsPipeline(call) &&
    resultText(call).includes('KeyError')
  );

  if (failingRun === -1) {
    return { name: 'edited pipeline then reran', kind: 'warning', pass: false, message: 'initial KeyError run not found' };
  }

  const editAfter = toolCalls.findIndex((call, i) =>
    i > failingRun &&
    (call.tool === 'write_file' || call.tool === 'edit_file') &&
    pathTargetsPipeline(call)
  );

  if (editAfter === -1) {
    return { name: 'edited pipeline then reran', kind: 'assertion', pass: false, message: 'no edit to pipeline.py after the KeyError' };
  }

  const rerun = toolCalls.findIndex((call, i) =>
    i > editAfter &&
    call.tool === 'shell_exec' &&
    commandMentionsPipeline(call) &&
    (resultText(call).includes('mean=81.50') || resultText(call).includes('average=81.50'))
  );

  return {
    name: 'edited pipeline then reran',
    kind: 'assertion',
    pass: rerun !== -1,
    message: rerun === -1 ? 'no successful rerun of pipeline.py after editing it' : undefined,
  };
}

export function check(result: EvalRunResult): EvalReport {
  return {
    scenarioId: '006-python-interface-mismatch',
    checks: [
      assertFileExists(result.workDir, 'pipeline.py'),
      assertFileExists(result.workDir, 'stats.py'),
      assertScriptRuns(result.workDir),
      assertCorrectOutput(result.workDir),
      assertRanFailingScript(result.toolCalls),
      assertInspectedStatsModule(result.toolCalls),
      assertFixedCallerNotModule(result.workDir),
      assertEditedPipelineThenReran(result.toolCalls),
      assertNoUnnecessaryTools(result.toolCalls, ['read_file', 'write_file', 'edit_file', 'shell_exec', 'list_dir']),
      assertStayedInWorkDir(result.toolCalls, result.workDir),
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
