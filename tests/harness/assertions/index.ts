import { assertExitCode } from './exit-code.js';
import { assertFakeLlmTrace } from './fake-llm-trace.js';
import { assertFiles } from './files.js';
import { assertOutput, assertStdoutBlock, outputRows } from './output.js';
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
  /** The scenario's own `env`, so `stdoutBlock` can require the stream it needs. */
  env?: Record<string, string>;
}): string[] {
  return [
    ...assertExitCode(input.expect.exitCode, input.exitCode),
    ...assertOutput(input.expect, input.stdout + input.stderr),
    ...assertStdoutBlock(input.expect.stdoutBlock, input.stdout, input.env),
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
  assertStdoutBlock,
  assertToolTrace,
  outputRows,
};

