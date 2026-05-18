import type { ToolTraceEvent, ToolTraceExpectation } from './types.js';

export function assertToolTrace(
  expectation: ToolTraceExpectation | undefined,
  trace: ToolTraceEvent[],
): string[] {
  if (!expectation) return [];

  const failures: string[] = [];
  const calls = trace.map(event => event.tool);

  if (expectation.maxCalls !== undefined && calls.length > expectation.maxCalls) {
    failures.push(`toolTrace.maxCalls: expected <= ${expectation.maxCalls}, got ${calls.length} (${calls.join(' -> ')})`);
  }

  if (expectation.sequence) {
    const expected = expectation.sequence.join(' -> ');
    const actual = calls.join(' -> ');
    if (actual !== expected) {
      failures.push(`toolTrace.sequence: expected ${expected || '(none)'}, got ${actual || '(none)'}`);
    }
  }

  for (const tool of expectation.present ?? []) {
    if (!calls.includes(tool)) {
      failures.push(`toolTrace missing: ${tool} (${calls.join(' -> ') || 'no tool calls'})`);
    }
  }

  for (const tool of expectation.absent ?? []) {
    if (calls.includes(tool)) {
      failures.push(`toolTrace unexpected: ${tool} (${calls.join(' -> ')})`);
    }
  }

  return failures;
}

