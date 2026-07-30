import { stripAnsi } from '../../../src/util/screen-buffer.js';
import { matchBlock } from '../pty/screen-assert.js';

/**
 * Split captured child output into the rows a block assertion matches against.
 * Colour is forced on in the harness (`FORCE_COLOR`), so SGR has to come off
 * first; `\r` would otherwise leave a phantom character at every line end on
 * Windows.
 */
export function outputRows(text: string): string[] {
  return stripAnsi(text).replace(/\r/g, '').split('\n');
}

/**
 * Assert an exact run of consecutive stdout lines, using the same matcher as the
 * TTY `screenBlock` — `*` for one volatile row, `...` for a gap, `re:` for a
 * pattern, and blank lines significant.
 *
 * Why stdout alone rather than the combined output the substring assertions use:
 * stdout and stderr are captured separately and concatenated, so their relative
 * order is already lost by the time an assertion runs. A block spanning both
 * would be asserting against an interleaving that never existed. The whole
 * transcript goes to stdout by default, so a scenario needs no `env` for this —
 * but `FREECODE_TRANSCRIPT_STREAM=null` silences it, and a layout assertion
 * against a silenced transcript would fail for a reason the author cannot see
 * in the diff. Reject that loudly instead.
 */
export function assertStdoutBlock(
  expected: string[] | undefined,
  stdout: string,
  env: Record<string, string> | undefined,
): string[] {
  if (!expected || expected.length === 0) return [];
  const stream = env?.['FREECODE_TRANSCRIPT_STREAM'];
  if (stream !== undefined && stream !== 'stdout') {
    return [
      `stdoutBlock cannot run with env.FREECODE_TRANSCRIPT_STREAM="${stream}": transcript ` +
      'output (tool call lines, result previews, step dividers) goes to stdout by default, ' +
      'and this block asserts against it. Drop the override.',
    ];
  }
  return matchBlock(outputRows(stdout), expected).map(failure => `stdout ${failure}`);
}

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

