import { stripAnsi } from "./screen-buffer.js";

/**
 * Terminal-row math for content that the terminal soft-wraps. Callers that must
 * fit a block into a known number of rows (e.g. a tool preview that has to leave
 * its header on screen) cannot count logical lines — one long line can occupy
 * several rows. These helpers count what the terminal will actually draw.
 */

const DEFAULT_COLUMNS = 80;

/** Current terminal width. Both transcript streams share one terminal. */
export function terminalColumns(): number {
  const envCols = parseInt(process.env["COLUMNS"] ?? "0", 10);
  return process.stdout.columns || envCols || DEFAULT_COLUMNS;
}

/** Rows one written line occupies once the terminal wraps it. */
export function visualRows(line: string, cols: number): number {
  const width = stripAnsi(line).length;
  if (width === 0 || cols <= 0) return 1;
  return Math.ceil(width / cols);
}

/**
 * Take the leading lines of `lines` that fit `maxRows` wrapped terminal rows,
 * keeping one row in hand for a caller's "... (N more lines)" note. `render`
 * maps a line to the text actually written (indent, colouring), so the wrap
 * math measures what lands on screen. Always keeps at least one line, so a
 * single over-long line still shows its head.
 */
export function fitLinesToRows(
  lines: string[],
  maxRows: number,
  render: (line: string) => string,
): string[] {
  const cols = terminalColumns();
  const budget = Math.max(1, maxRows - 1);
  const fitted: string[] = [];
  let used = 0;
  for (const line of lines) {
    const rows = visualRows(render(line), cols);
    if (fitted.length > 0 && used + rows > budget) break;
    fitted.push(line);
    used += rows;
  }
  return fitted;
}
