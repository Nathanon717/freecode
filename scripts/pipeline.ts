/**
 * Single source of truth for the test pipeline sections.
 *
 * Both `scripts/test.ts` (silent-on-success pass/fail) and `scripts/time.ts`
 * (instrumented timing report) iterate this same list, so the two front-ends
 * can never drift in which sections run, in what order, or with what command.
 *
 * `test.ts` runs each section's command verbatim. `time.ts` runs the same
 * commands but swaps in instrumentation for the sections that support a
 * sub-breakdown (unit → vitest JSON reporter; scenarios → SCENARIO_TIMING_JSON).
 */

export const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// On Windows, npm/npx are .cmd batch scripts that cannot be spawned without a
// shell; on Linux they are real executables.
export const useShell = process.platform === 'win32';

// PTY harness tests require a real PTY, so they are excluded from the normal
// unit run and live behind `npm run test:pty`.
export const PTY_EXCLUDES = [
  '--exclude', 'tests/harness/pty/driver.test.ts',
  '--exclude', 'tests/harness/pty/session.test.ts',
];

export interface PipelineSection {
  // Scope keyword accepted by `npm run time <key>`.
  key: string;
  // Human-readable label shown in output.
  label: string;
  // Command + args as `npm test` runs them (verbatim, no instrumentation).
  cmd: string;
  args: string[];
}

export const SECTIONS: PipelineSection[] = [
  { key: 'build', label: 'build', cmd: npm, args: ['run', 'build'] },
  { key: 'lint', label: 'lint', cmd: npm, args: ['run', 'lint'] },
  { key: 'docs', label: 'docs', cmd: npm, args: ['run', 'docs:generate'] },
  { key: 'scenarios', label: 'scenarios', cmd: npm, args: ['run', 'verify:scenarios'] },
  {
    key: 'unit',
    label: 'unit tests',
    cmd: 'npx',
    args: ['vitest', 'run', '--reporter=dot', ...PTY_EXCLUDES],
  },
];
