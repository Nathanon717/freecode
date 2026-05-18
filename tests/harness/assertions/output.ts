export function assertOutput(expectation: {
  stdoutContains?: string[];
  stdoutAbsent?: string[];
}, combinedOutput: string): string[] {
  const failures: string[] = [];

  for (const needle of expectation.stdoutContains ?? []) {
    if (!combinedOutput.includes(needle)) {
      failures.push(`missing: ${JSON.stringify(needle)}`);
    }
  }

  for (const needle of expectation.stdoutAbsent ?? []) {
    if (combinedOutput.includes(needle)) {
      failures.push(`unexpected: ${JSON.stringify(needle)}`);
    }
  }

  return failures;
}

