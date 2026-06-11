import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { EvalRunResult, EvalReport, CheckResult } from '../../shared/types.js';
import {
  assertFileExists,
  assertNoUnnecessaryTools,
  assertStayedInWorkDir,
  statToolCalls,
  statTokens,
} from '../../shared/assertions.js';

function assertJsonField(workDir: string, filename: string, field: string, expected: unknown): CheckResult {
  const filePath = join(workDir, filename);
  if (!existsSync(filePath)) {
    return { name: `${filename}.${field}`, kind: 'assertion', pass: false, message: `${filename} does not exist` };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return { name: `${filename}.${field}`, kind: 'assertion', pass: false, message: `${filename} is not valid JSON` };
  }
  const actual = parsed[field];
  const pass = actual === expected;
  return {
    name: `${filename}.${field}`,
    kind: 'assertion',
    pass,
    message: pass ? undefined : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  };
}

export function check(result: EvalRunResult): EvalReport {
  return {
    scenarioId: '002-edit-config',
    checks: [
      assertFileExists(result.workDir, 'config.json'),
      assertJsonField(result.workDir, 'config.json', 'theme', 'dark'),
      assertJsonField(result.workDir, 'config.json', 'language', 'en'),
      assertJsonField(result.workDir, 'config.json', 'maxRetries', 3),
      assertJsonField(result.workDir, 'config.json', 'debug', false),
      assertNoUnnecessaryTools(result.toolCalls, ['read', 'create', 'edit']),
      assertStayedInWorkDir(result.toolCalls, result.workDir),
      statToolCalls(result.toolCalls),
      statTokens(result.tokens),
    ],
  };
}
