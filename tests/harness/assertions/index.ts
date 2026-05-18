import { assertExitCode } from './exit-code.js';
import { assertFiles } from './files.js';
import { assertOutput } from './output.js';
import { assertToolTrace } from './tool-trace.js';
import type { ScenarioExpectations, ToolTraceEvent } from './types.js';

export type {
  FileExpectation,
  ScenarioExpectations,
  ToolTraceEvent,
  ToolTraceExpectation,
} from './types.js';

export function assertScenarioExpectations(input: {
  expect: ScenarioExpectations;
  stdout: string;
  stderr: string;
  exitCode: number;
  trace: ToolTraceEvent[];
  workspaceRoot: string;
  workspace: 'repo' | 'temp';
}): string[] {
  return [
    ...assertExitCode(input.expect.exitCode, input.exitCode),
    ...assertOutput(input.expect, input.stdout + input.stderr),
    ...assertFiles(input.expect.files, input.workspaceRoot, input.workspace),
    ...assertToolTrace(input.expect.toolTrace, input.trace),
  ];
}

export {
  assertExitCode,
  assertFiles,
  assertOutput,
  assertToolTrace,
};

