/**
 * The 500-line limit and the arithmetic that measures against it.
 *
 * Its own module so the gate (`check-line-limits.ts`), the `Budget` section on
 * every map page, and the line counts in the map's structure tree cannot drift
 * apart — a page claiming "32 to spare" while the gate counts one line more is
 * worse than no page at all. Read `docs/line-limit.md` for the rule itself.
 */

export const MAX_LINES = 500;

/**
 * A block comment opening the file, plus the blank line that separates it from
 * the first statement. Anything below it — including another block comment — is
 * ordinary content.
 */
const MODULE_HEADER = /^\s*\/\*[\s\S]*?\*\/[^\S\n]*\n?\n?/;

/**
 * Lines as the limit counts them: a trailing newline does not open a new line,
 * and the module header comment is free.
 *
 * The header is exempt because it is where `@role` and `@readwhen` live. A file
 * that states its own purpose must not be pushed over the limit for doing so,
 * and the alternative — paying for it — is an incentive to describe the module
 * somewhere the code cannot invalidate. Only the header is exempt; a comment
 * anywhere below it counts like any other line, so the limit still measures how
 * much file there is to read.
 */
export function countLines(content: string): number {
  const lines = content.replace(MODULE_HEADER, '').split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}
