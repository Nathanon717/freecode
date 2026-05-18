export function assertExitCode(expected: number | undefined, actual: number): string[] {
  if (expected === undefined || actual === expected) return [];
  return [`exitCode: expected ${expected}, got ${actual}`];
}

