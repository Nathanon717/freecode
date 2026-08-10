/**
 * @role The raw terminal protocol the bottom UI is built from — rows/columns, scroll-region (DECSTBM), cursor addressing, line erase, cursor save/restore — with no knowledge of the footer, input frame, or any layout. Every operation has a `…Sequence()` form returning the string, plus a writing form where a caller needs one; prefer the former so a frame goes out in one `process.stdout.write`.
 */

// Terminal geometry and the raw escape sequences the chrome is built from.
// Pure protocol: nothing here knows about the footer, the input frame, or any
// layout — callers compose these into the sequences they write.

const ESC = '\x1b[';

/** Current terminal height in rows; falls back to 24 when stdout is not a TTY. */
export function rows(): number { return process.stdout.rows || 24; }

/** Current terminal width in columns; falls back to 80 when stdout is not a TTY. */
export function cols(): number { return process.stdout.columns || 80; }

/**
 * DECSTBM — set the scroll region to rows `top`..`bottom` (1-based, inclusive).
 * Note that DECSTBM also homes the cursor to (1,1); wrap it in
 * `saveCursorSequence()` / `restoreCursorSequence()` when the caller's cursor
 * position still matters. A caller that absolute-positions immediately
 * afterwards (teardown, resize) does not need to.
 */
export function setScrollRegionSequence(top: number, bottom: number): string {
  return `${ESC}${top};${bottom}r`;
}

export function setScrollRegion(top: number, bottom: number): void {
  process.stdout.write(setScrollRegionSequence(top, bottom));
}

/** Drops the scroll region, restoring the full screen. Also homes the cursor. */
export function resetScrollRegionSequence(): string {
  return `${ESC}r`;
}

export function resetScrollRegion(): void {
  process.stdout.write(resetScrollRegionSequence());
}

export function moveToSequence(row: number, col: number): string {
  return `${ESC}${row};${col}H`;
}

export function moveTo(row: number, col: number): void {
  process.stdout.write(moveToSequence(row, col));
}

/** `\x1b[2K` — erases the cursor's row without moving the cursor or touching scrollback. */
export function clearLineSequence(): string {
  return `${ESC}2K`;
}

export function saveCursorSequence(): string {
  return `${ESC}s`;
}

export function restoreCursorSequence(): string {
  return `${ESC}u`;
}
