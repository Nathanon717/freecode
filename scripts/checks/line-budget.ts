/**
 * The 500-line limit and the arithmetic that measures against it.
 *
 * Its own module so the gate (`check-line-limits.ts`), the `Budget` section on
 * every map page, and the line counts in the map's structure tree cannot drift
 * apart — a page claiming "32 to spare" while the gate counts one line more is
 * worse than no page at all. Read `docs/line-limit.md` for the rule itself.
 */

export const MAX_LINES = 500;

/** Lines as the limit counts them: a trailing newline does not open a new line. */
export function countLines(content: string): number {
  const lines = content.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}
