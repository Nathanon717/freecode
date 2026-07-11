export function assertOutput(expectation: {
  stdoutContains?: string[];
  stdoutAbsent?: string[];
  stdoutOrder?: string[];
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

  // Each needle must appear after the previous one's first occurrence.
  let searchFrom = 0;
  for (const needle of expectation.stdoutOrder ?? []) {
    const at = combinedOutput.indexOf(needle, searchFrom);
    if (at === -1) {
      const anywhere = combinedOutput.includes(needle);
      failures.push(
        anywhere
          ? `out of order: ${JSON.stringify(needle)} appears before an earlier expected item`
          : `missing (ordered): ${JSON.stringify(needle)}`,
      );
      // Stop advancing on the first ordering break to keep the message actionable.
      break;
    }
    searchFrom = at + needle.length;
  }

  return failures;
}

