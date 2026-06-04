import type { FakeLlmTraceEvent, FakeLlmTraceExpectation } from './types.js';

export function assertFakeLlmTrace(
  expectation: FakeLlmTraceExpectation | undefined,
  trace: FakeLlmTraceEvent[],
): string[] {
  if (!expectation) return [];

  const failures: string[] = [];

  if (expectation.callCount !== undefined && trace.length !== expectation.callCount) {
    failures.push(`fakeLlmTrace.callCount: expected ${expectation.callCount}, got ${trace.length}`);
  }

  if (expectation.maxCalls !== undefined && trace.length > expectation.maxCalls) {
    failures.push(`fakeLlmTrace.maxCalls: expected <= ${expectation.maxCalls}, got ${trace.length}`);
  }

  for (let i = 0; i < (expectation.calls ?? []).length; i++) {
    const expected = expectation.calls![i];
    const actual = trace[i];
    const label = `fakeLlmTrace.calls[${i}]`;
    if (!actual) {
      failures.push(`${label}: missing call`);
      continue;
    }

    if (expected.provider !== undefined && actual.providerId !== expected.provider) {
      failures.push(`${label}.provider: expected ${expected.provider}, got ${actual.providerId}`);
    }
    if (expected.model !== undefined && actual.modelId !== expected.model) {
      failures.push(`${label}.model: expected ${expected.model}, got ${actual.modelId}`);
    }
    if (expected.executionPath !== undefined && actual.executionPath !== expected.executionPath) {
      failures.push(`${label}.executionPath: expected ${expected.executionPath}, got ${actual.executionPath ?? '(missing)'}`);
    }
    if (expected.inputMessageCount !== undefined && actual.inputMessageCount !== expected.inputMessageCount) {
      failures.push(`${label}.inputMessageCount: expected ${expected.inputMessageCount}, got ${actual.inputMessageCount}`);
    }
    if (expected.toolRationale !== undefined && actual.toolRationale !== expected.toolRationale) {
      failures.push(`${label}.toolRationale: expected ${expected.toolRationale}, got ${actual.toolRationale ?? '(missing)'}`);
    }
    if (expected.parallelTools !== undefined && actual.parallelTools !== expected.parallelTools) {
      failures.push(`${label}.parallelTools: expected ${expected.parallelTools}, got ${actual.parallelTools ?? '(missing)'}`);
    }
    if (expected.nativeToolsSupplied !== undefined && actual.nativeToolsSupplied !== expected.nativeToolsSupplied) {
      failures.push(`${label}.nativeToolsSupplied: expected ${expected.nativeToolsSupplied}, got ${actual.nativeToolsSupplied ?? '(missing)'}`);
    }

    for (const text of expected.lastUserContains ?? []) {
      if (!actual.lastUserMessage.includes(text)) {
        failures.push(`${label}.lastUserContains missing: ${JSON.stringify(text)}`);
      }
    }

    for (const tool of expected.toolsAvailable ?? []) {
      if (!actual.toolNames.includes(tool)) {
        failures.push(`${label}.toolsAvailable missing: ${tool} (${actual.toolNames.join(', ') || 'no tools'})`);
      }
    }

    for (const tool of expected.toolsAbsent ?? []) {
      if (actual.toolNames.includes(tool)) {
        failures.push(`${label}.toolsAbsent unexpected: ${tool} (${actual.toolNames.join(', ')})`);
      }
    }

    const emittedText = actual.emittedChunks.join('');
    for (const text of expected.emittedTextContains ?? []) {
      if (!emittedText.includes(text)) {
        failures.push(`${label}.emittedTextContains missing: ${JSON.stringify(text)}`);
      }
    }

    const emittedToolNames = (actual.emittedToolCalls ?? []).map(call => call.name);
    for (const toolName of expected.emittedToolCalls ?? []) {
      if (!emittedToolNames.includes(toolName)) {
        failures.push(`${label}.emittedToolCalls missing: ${toolName} (${emittedToolNames.join(', ') || 'no tool calls'})`);
      }
    }

    const usage = expected.usage;
    if (usage?.totalTokens !== undefined && actual.usage.totalTokens !== usage.totalTokens) {
      failures.push(`${label}.usage.totalTokens: expected ${usage.totalTokens}, got ${actual.usage.totalTokens}`);
    }
    if (usage?.promptTokens !== undefined && actual.usage.promptTokens !== usage.promptTokens) {
      failures.push(`${label}.usage.promptTokens: expected ${usage.promptTokens}, got ${actual.usage.promptTokens}`);
    }
    if (usage?.outputTokens !== undefined && actual.usage.outputTokens !== usage.outputTokens) {
      failures.push(`${label}.usage.outputTokens: expected ${usage.outputTokens}, got ${actual.usage.outputTokens}`);
    }
  }

  return failures;
}
