import { assertExitCode } from './exit-code.js';
import { assertFakeLlmTrace } from './fake-llm-trace.js';
import { assertFiles } from './files.js';
import { assertOutput } from './output.js';
import { assertToolTrace } from './tool-trace.js';
import type { FakeLlmTraceEvent, E2eExpectations, ToolTraceEvent } from './types.js';

export type {
  FakeLlmTraceEvent,
  FakeLlmTraceExpectation,
  FileExpectation,
  E2eExpectations,
  ToolTraceEvent,
  ToolTraceExpectation,
} from './types.js';

export function assertE2eExpectations(input: {
  expect: E2eExpectations;
  stdout: string;
  stderr: string;
  exitCode: number;
  trace: ToolTraceEvent[];
  fakeLlmTrace: FakeLlmTraceEvent[];
  workspaceRoot: string;
  workspace: 'repo' | 'temp';
}): string[] {
  return [
    ...assertExitCode(input.expect.exitCode, input.exitCode),
    ...assertOutput(input.expect, input.stdout + input.stderr),
    ...assertFiles(input.expect.files, input.workspaceRoot, input.workspace),
    ...assertToolTrace(input.expect.toolTrace, input.trace),
    ...assertFakeLlmTrace(input.expect.fakeLlmTrace, input.fakeLlmTrace),
  ];
}

export {
  assertExitCode,
  assertFakeLlmTrace,
  assertFiles,
  assertOutput,
  assertToolTrace,
};

