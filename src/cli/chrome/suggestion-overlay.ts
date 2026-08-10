/**
 * @role The snapshot/restore half of the slash-command suggestion rows. Owns the captured screen lines and the escape sequence that repaints them; `bottom-ui.ts` owns where the rows sit and when they open.
 *
 * @readwhen
 * Debugging transcript rows left blank or duplicated after a `/` menu closes, or changing where suggestion rows draw.
 */

// Slash-command suggestion rows, which draw *over* the scroll region rather than
// inside the reserved bottom rows.
//
// Because they overpaint live transcript, the rows they cover are snapshotted
// from the screen buffer when the overlay opens and repainted from that snapshot
// when it closes. Extracted from `bottom-ui.ts`, which owns the reserved-row
// geometry; this module owns only the snapshot and its restore sequence.

import { stripAnsi, getScreenBufferDisplayLinesForOverlay } from '../../util/screen-buffer.js';
import { moveToSequence, clearLineSequence } from './ansi.js';

let overlayRows = 0;
let overlayStartRow = 0;
let restoreLines: string[] = [];

export function getOverlayRows(): number {
  return overlayRows;
}

/** Drop the snapshot without repainting — for when every absolute row moved (resize). */
export function resetOverlay(): void {
  overlayRows = 0;
  restoreLines = [];
}

/** Snapshot the `n` scroll-region rows the overlay is about to cover. */
export function captureOverlay(n: number, startRow: number, scrollHeight: number): void {
  overlayRows = n;
  overlayStartRow = startRow;
  restoreLines = getScreenBufferDisplayLinesForOverlay(n, scrollHeight);
}

/**
 * Escape sequence that repaints the covered rows from the snapshot, and clears
 * it — there is no separate close call. Returns '' when no overlay is open, so
 * callers can concatenate blindly.
 */
export function composeOverlayRestore(width: number): string {
  if (overlayRows === 0) return '';
  const rowCount = overlayRows;
  const startRow = overlayStartRow;
  const maxWidth = Math.max(0, width);
  const padRows = Math.max(0, rowCount - restoreLines.length);
  const lines = [
    ...Array.from({ length: padRows }, () => ''),
    ...restoreLines,
  ].slice(-rowCount);
  let output = '';
  for (let i = 0; i < rowCount; i++) {
    const line = lines[i] ?? '';
    const visible = stripAnsi(line);
    // Use visible length for truncation so ANSI color bytes don't count as width.
    const content = visible.length <= maxWidth ? line : visible.slice(0, maxWidth);
    output += moveToSequence(startRow + i, 1) + clearLineSequence() + content + (content ? '\x1b[0m' : '');
  }
  resetOverlay();
  return output;
}
