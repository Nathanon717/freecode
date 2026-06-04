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

// grades.csv: Math [70,80,90] mean=80 std=10.00; English [85,95] mean=90 std=7.07; Science [88] no std
const expectedOutput = 'English: avg=90.0 std=7.07\nMath: avg=80.0 std=10.00\nScience: avg=88.0\n';

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

type ScriptRunResult =
  | { ok: true; stdout: string; command: string }
  | { ok: false; message: string };

function runScript(workDir: string): ScriptRunResult {
  const scriptPath = join(workDir, 'analyze_grades.py');
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
      return {
        ok: false,
        message: `${candidate.command} exited ${run.status}; stderr=${JSON.stringify(run.stderr)}`,
      };
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
    message: pass
      ? undefined
      : formatOutputDiff(result.stdout, expectedOutput),
  };
}

function commandMentionsScript(call: ToolCall): boolean {
  const command = call.args.command;
  return typeof command === 'string' && command.includes('analyze_grades.py');
}

function pathTargetsScript(call: ToolCall): boolean {
  const path = call.args.path;
  if (typeof path !== 'string') return false;
  const normalized = path.replace(/\\/g, '/');
  return normalized === 'analyze_grades.py' || normalized.endsWith('/analyze_grades.py');
}

function resultText(call: ToolCall): string {
  return typeof call.result === 'string' ? call.result : JSON.stringify(call.result ?? '');
}

function assertEncounteredFirstBug(toolCalls: ToolCall[]): CheckResult {
  const run = toolCalls.find(call =>
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('ValueError')
  );

  return {
    name: 'encountered first bug (ValueError)',
    kind: 'warning',
    pass: run !== undefined,
    message: run ? undefined : 'no shell_exec of analyze_grades.py produced a ValueError — agent may not have run the script before fixing it',
  };
}

function assertEncounteredSecondBug(toolCalls: ToolCall[]): CheckResult {
  // The StatisticsError must appear after the first edit (i.e., the first bug was fixed first)
  const firstEdit = toolCalls.findIndex(call =>
    (call.tool === 'write_file' || call.tool === 'edit_file') &&
    pathTargetsScript(call)
  );

  if (firstEdit === -1) {
    return {
      name: 'encountered second bug (StatisticsError)',
      kind: 'assertion',
      pass: false,
      message: 'no edit to analyze_grades.py found at all',
    };
  }

  const secondFailure = toolCalls.findIndex((call, i) =>
    i > firstEdit &&
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('StatisticsError')
  );

  return {
    name: 'encountered second bug (StatisticsError)',
    kind: 'warning',
    pass: secondFailure !== -1,
    message: secondFailure === -1
      ? 'no shell_exec after the first edit produced a StatisticsError — both bugs may have been fixed in one shot without observing the second failure'
      : undefined,
  };
}

function assertTwoEditCycles(toolCalls: ToolCall[]): CheckResult {
  // Process check only: did the agent fix the two bugs across two separate
  // run-fail-fix cycles? A correct one-shot fix (both bugs patched in a single
  // edit) still produces the right output, so this is a `warning`, not an
  // `assertion` — final correctness is covered by `script runs`.
  // Verify: run → fail (ValueError) → edit → run → fail (StatisticsError) → edit → run → pass
  const firstValueError = toolCalls.findIndex(call =>
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('ValueError')
  );

  if (firstValueError === -1) {
    return { name: 'two edit cycles', kind: 'warning', pass: false, message: 'first ValueError run not found' };
  }

  const editAfterFirst = toolCalls.findIndex((call, i) =>
    i > firstValueError &&
    (call.tool === 'write_file' || call.tool === 'edit_file') &&
    pathTargetsScript(call)
  );

  if (editAfterFirst === -1) {
    return { name: 'two edit cycles', kind: 'warning', pass: false, message: 'no edit after ValueError' };
  }

  const statisticsError = toolCalls.findIndex((call, i) =>
    i > editAfterFirst &&
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('StatisticsError')
  );

  if (statisticsError === -1) {
    return { name: 'two edit cycles', kind: 'warning', pass: false, message: 'StatisticsError not encountered after first fix' };
  }

  const editAfterSecond = toolCalls.findIndex((call, i) =>
    i > statisticsError &&
    (call.tool === 'write_file' || call.tool === 'edit_file') &&
    pathTargetsScript(call)
  );

  if (editAfterSecond === -1) {
    return { name: 'two edit cycles', kind: 'warning', pass: false, message: 'no second edit after StatisticsError' };
  }

  const passingRun = toolCalls.findIndex((call, i) =>
    i > editAfterSecond &&
    call.tool === 'shell_exec' &&
    commandMentionsScript(call) &&
    resultText(call).includes('Math: avg=80.0')
  );

  return {
    name: 'two edit cycles',
    kind: 'warning',
    pass: passingRun !== -1,
    message: passingRun === -1 ? 'no successful run after second edit' : undefined,
  };
}

export function check(result: EvalRunResult): EvalReport {
  return {
    scenarioId: '007-python-two-bug-cascade',
    checks: [
      assertFileExists(result.workDir, 'analyze_grades.py'),
      assertFileExists(result.workDir, 'grades.csv'),
      assertScriptRuns(result.workDir),
      assertCorrectOutput(result.workDir),
      assertEncounteredFirstBug(result.toolCalls),
      assertEncounteredSecondBug(result.toolCalls),
      assertTwoEditCycles(result.toolCalls),
      assertNoUnnecessaryTools(result.toolCalls, ['read_file', 'write_file', 'edit_file', 'shell_exec', 'list_dir']),
      assertStayedInWorkDir(result.toolCalls, result.workDir),
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
