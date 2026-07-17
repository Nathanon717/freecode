/**
 * Render lines with a right-aligned line-number gutter so every colon lines up
 * regardless of digit count. Shared by the read tool (model-facing output) and
 * the create/edit transcript previews so all three show one gutter format.
 *
 * The gutter width is the digit count of the largest number rendered, so within
 * a block ` 9: `, `10: `, `100: ` all align on the colon.
 */
export function withLineNumbers(startLine: number, lines: string[]): string[] {
  if (lines.length === 0) return [];
  const width = String(startLine + lines.length - 1).length;
  return lines.map((line, i) => `${String(startLine + i).padStart(width)}: ${line}`);
}
