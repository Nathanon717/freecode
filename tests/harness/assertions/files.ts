import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import type { FileExpectation } from './types.js';

export function assertFiles(
  expectations: FileExpectation[] | undefined,
  workspaceRoot: string,
  workspace: 'repo' | 'temp',
): string[] {
  const failures: string[] = [];

  for (const fileExpect of expectations ?? []) {
    const fullPath = join(workspaceRoot, fileExpect.path);
    if (!existsSync(fullPath)) {
      failures.push(`file missing: ${fileExpect.path}`);
      if (workspace === 'temp') {
        const actualFiles = readdirSync(workspaceRoot);
        failures.push(`          actual files: ${actualFiles.length > 0 ? actualFiles.join(', ') : '(none)'}`);
      }
      continue;
    }

    if (basename(fullPath) !== basename(fileExpect.path)) {
      failures.push(`file name mismatch: expected ${JSON.stringify(basename(fileExpect.path))}, got ${JSON.stringify(basename(fullPath))}`);
    }

    if (fileExpect.contentExact !== undefined) {
      const actual = readFileSync(fullPath, 'utf-8');
      if (actual !== fileExpect.contentExact) {
        failures.push(`file content mismatch: ${fileExpect.path}`);
        failures.push(`          expected: ${JSON.stringify(fileExpect.contentExact)}`);
        failures.push(`          actual:   ${JSON.stringify(actual)}`);
      }
    }
  }

  return failures;
}

