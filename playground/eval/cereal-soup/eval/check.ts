import type { EvalRunResult, EvalReport } from '../../shared/types.js';
import { statToolCalls, statTokens } from '../../shared/assertions.js';

export function check(result: EvalRunResult): EvalReport {
  const noTools: import('../../shared/types.js').CheckResult = {
    name: 'no tool calls',
    kind: 'assertion',
    pass: result.toolCalls.length === 0,
    message: result.toolCalls.length === 0
      ? undefined
      : `expected no tool calls, got ${result.toolCalls.length}: ${result.toolCalls.map(t => t.tool).join(', ')}`,
  };

  const hasResponse: import('../../shared/types.js').CheckResult = {
    name: 'gave a response',
    kind: 'assertion',
    pass: result.stdout.trim().length > 0,
    message: result.stdout.trim().length > 0 ? undefined : 'no output from agent',
  };

  return {
    scenarioId: 'cereal-soup',
    checks: [
      noTools,
      hasResponse,
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
