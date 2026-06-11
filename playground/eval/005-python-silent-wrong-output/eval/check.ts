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

const expectedOutput = 'items=3\nrevenue=102.50\n';
const wrongOutput = 'revenue=49.50';

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function assertScriptRuns(workDir: string): CheckResult {
  const scriptPath = join(workDir, 'report.py');
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
    const stdout = normalizeNewlines(run.stdout);
    const pass = run.status === 0 && stdout === expectedOutput;
    return {
      name: 'output matches expected',
      kind: 'assertion',
      pass,
      message: pass
        ? undefined
        : formatOutputDiff(stdout, expectedOutput) + (run.stderr.trim() ? `\n  stderr: ${run.stderr.trim()}` : ''),
    };
  }

  return {
    name: 'output matches expected',
    kind: 'assertion',
    pass: false,
    message: `no Python executable available (${failures.join('; ')})`,
  };
}

function commandMentionsScript(call: ToolCall): boolean {
  const command = call.args.command;
  return typeof command === 'string' && command.includes('report.py');
}

function pathTargetsScript(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'report.py' || normalized.endsWith('/report.py');
}

function pathTargetsCsv(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'sales.csv' || normalized.endsWith('/sales.csv');
}

function resultText(call: ToolCall): string {
  return typeof call.result === 'string' ? call.result : JSON.stringify(call.result ?? '');
}

function assertFirstRunSucceededWithWrongOutput(toolCalls: ToolCall[]): CheckResult {
  const wrongRun = toolCalls.find(call =>
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    !call.error &&
    resultText(call).includes(wrongOutput)
  );

  return {
    name: 'first run exits 0 with wrong output',
    kind: 'warning',
    pass: wrongRun !== undefined,
    message: wrongRun ? undefined : `report.py not run with wrong output (revenue=49.50) before fix`,
  };
}

function assertInspectedData(toolCalls: ToolCall[]): CheckResult {
  const inspected = toolCalls.some(call =>
    (call.tool === 'read' && pathTargetsCsv(call)) ||
    resultText(call).includes('unit_price')
  );

  return {
    name: 'inspected input data',
    kind: 'warning',
    pass: inspected,
    message: inspected ? undefined : 'no tool call captured inspection of sales.csv',
  };
}

function assertAgentRanScript(toolCalls: ToolCall[]): CheckResult {
  const ran = toolCalls.some(call =>
    call.tool === 'shell_exec' && commandMentionsScript(call)
  );
  return {
    name: 'agent ran report.py',
    kind: 'assertion',
    pass: ran,
    message: ran ? undefined : 'agent never executed report.py during the session',
  };
}

function assertEditedThenReran(toolCalls: ToolCall[]): CheckResult {
  const wrongRun = toolCalls.findIndex(call =>
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes(wrongOutput)
  );

  if (wrongRun === -1) {
    return {
      name: 'edited then reran',
      kind: 'warning',
      pass: false,
      message: 'initial wrong-output run not found in tool calls',
    };
  }

  const editAfter = toolCalls.findIndex((call, i) =>
    i > wrongRun &&
    (call.tool === 'create' || call.tool === 'edit') &&
    pathTargetsScript(call)
  );

  if (editAfter === -1) {
    return {
      name: 'edited then reran',
      kind: 'assertion',
      pass: false,
      message: 'no edit to report.py after observing wrong output',
    };
  }

  const rerun = toolCalls.findIndex((call, i) =>
    i > editAfter &&
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('revenue=102.50')
  );

  return {
    name: 'edited then reran',
    kind: 'warning',
    pass: rerun !== -1,
    message: rerun === -1 ? 'no successful rerun of report.py after the edit' : undefined,
  };
}

export function check(result: EvalRunResult): EvalReport {
  return {
    scenarioId: '005-python-silent-wrong-output',
    checks: [
      assertFileExists(result.workDir, 'report.py'),
      assertFileExists(result.workDir, 'sales.csv'),
      assertScriptRuns(result.workDir),
      assertAgentRanScript(result.toolCalls),
      assertFirstRunSucceededWithWrongOutput(result.toolCalls),
      assertInspectedData(result.toolCalls),
      assertEditedThenReran(result.toolCalls),
      assertNoUnnecessaryTools(result.toolCalls, ['read', 'create', 'edit', 'shell_exec', 'list_dir']),
      assertStayedInWorkDir(result.toolCalls, result.workDir),
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
