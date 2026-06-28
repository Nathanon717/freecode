import type { EvalRunResult, EvalReport } from '../../shared/types.js';
import {
  assertFileExists,
  assertFileContent,
  assertNoUnnecessaryTools,
  assertStayedInWorkDir,
  statToolCalls,
  statTokens,
} from '../../shared/assertions.js';

export function check(result: EvalRunResult): EvalReport {
  return {
    scenarioId: '001-hello-world',
    checks: [
      assertFileExists(result.workDir, 'hello.txt'),
      assertFileContent(result.workDir, 'hello.txt', 'Hello, World!'),
      assertNoUnnecessaryTools(result.toolCalls, ['create', 'list_dir']),
      assertStayedInWorkDir(result.toolCalls, result.workDir),
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
