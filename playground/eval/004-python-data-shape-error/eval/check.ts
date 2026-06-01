import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import type { EvalRunResult, EvalReport, CheckResult, ToolCall } from '../../shared/types.js';
import {
  assertFileContent,
  assertFileExists,
  assertNoUnnecessaryTools,
  assertStayedInWorkDir,
  statToolCalls,
  statTokens,
} from '../../shared/assertions.js';

const expectedOutput = 'orders=2\nunits=5\nrevenue=37.75\n';
const expectedCsv = 'sku,qty,unit_price,status\nA100,2,12.50,shipped\nB200,1,8.00,cancelled\nC300,3,4.25,shipped\n';

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function assertScriptRuns(workDir: string): CheckResult {
  const scriptPath = join(workDir, 'analyze_orders.py');
  if (!existsSync(scriptPath)) {
    return { name: 'script runs', kind: 'assertion', pass: false, message: 'analyze_orders.py does not exist' };
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
    const stdout = normalizeNewlines(run.stdout);
    const stderr = normalizeNewlines(run.stderr);
    const pass = run.status === 0 && stdout === expectedOutput;
    return {
      name: 'script runs',
      kind: 'assertion',
      pass,
      message: pass
        ? undefined
        : `${candidate.command} exited ${run.status}; stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`,
    };
  }

  return {
    name: 'script runs',
    kind: 'assertion',
    pass: false,
    message: `no Python executable available (${failures.join('; ')})`,
  };
}

function commandMentionsScript(call: ToolCall): boolean {
  const command = call.args.command;
  return typeof command === 'string' && command.includes('analyze_orders.py');
}

function pathTargetsScript(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'analyze_orders.py' || normalized.endsWith('/analyze_orders.py');
}

function pathTargetsCsv(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'orders.csv' || normalized.endsWith('/orders.csv');
}

function resultText(call: ToolCall): string {
  return typeof call.result === 'string' ? call.result : JSON.stringify(call.result ?? '');
}

function assertInspectedData(toolCalls: ToolCall[]): CheckResult {
  const inspected = toolCalls.some(call =>
    (call.tool === 'read_file' && pathTargetsCsv(call)) ||
    (call.tool === 'shell_exec' && resultText(call).includes('sku,qty,unit_price,status')) ||
    resultText(call).includes('sku,qty,unit_price,status')
  );

  return {
    name: 'inspected input data',
    kind: 'warning',
    pass: inspected,
    message: inspected ? undefined : 'no tool call captured inspection of orders.csv',
  };
}

function assertRanFailedThenFixed(toolCalls: ToolCall[]): CheckResult {
  const failingRun = toolCalls.findIndex(call =>
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('KeyError')
  );

  if (failingRun === -1) {
    return {
      name: 'ran failing script first',
      kind: 'warning',
      pass: false,
      message: 'no shell_exec of analyze_orders.py captured the initial KeyError',
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
      message: 'no edit to analyze_orders.py happened after the failing run',
    };
  }

  const passingRun = toolCalls.findIndex((call, index) =>
    index > editAfterFailure &&
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('orders=2') &&
    resultText(call).includes('units=5') &&
    resultText(call).includes('revenue=37.75')
  );

  return {
    name: 'reran fixed script',
    kind: 'assertion',
    pass: passingRun !== -1,
    message: passingRun === -1 ? 'no successful rerun of analyze_orders.py after the edit was captured' : undefined,
  };
}

function assertCsvNotEdited(toolCalls: ToolCall[], workDir: string): CheckResult {
  const csvEdit = toolCalls.find(call =>
    (call.tool === 'write_file' || call.tool === 'edit_file') &&
    pathTargetsCsv(call)
  );
  if (csvEdit) {
    return {
      name: 'preserved input data',
      kind: 'assertion',
      pass: false,
      message: 'orders.csv was edited instead of fixing the script',
    };
  }

  return assertFileContent(workDir, 'orders.csv', expectedCsv);
}

function assertUsesQtyColumn(workDir: string): CheckResult {
  const scriptPath = join(workDir, 'analyze_orders.py');
  if (!existsSync(scriptPath)) {
    return { name: 'uses data schema', kind: 'assertion', pass: false, message: 'analyze_orders.py does not exist' };
  }
  const script = readFileSync(scriptPath, 'utf-8');
  const pass = script.includes('["qty"]') || script.includes("['qty']");
  return {
    name: 'uses data schema',
    kind: 'assertion',
    pass,
    message: pass ? undefined : 'fixed script does not appear to read the qty column',
  };
}

export function check(result: EvalRunResult): EvalReport {
  return {
    scenarioId: '004-python-data-shape-error',
    checks: [
      assertFileExists(result.workDir, 'analyze_orders.py'),
      assertFileExists(result.workDir, 'orders.csv'),
      assertScriptRuns(result.workDir),
      assertRanFailedThenFixed(result.toolCalls),
      assertInspectedData(result.toolCalls),
      assertCsvNotEdited(result.toolCalls, result.workDir),
      assertUsesQtyColumn(result.workDir),
      assertNoUnnecessaryTools(result.toolCalls, ['read_file', 'write_file', 'edit_file', 'shell_exec', 'list_dir']),
      assertStayedInWorkDir(result.toolCalls, result.workDir),
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
