/**
 * @role The raw terminal protocol the bottom UI is built from — current rows/columns, scroll-region (DECSTBM), cursor addressing, line erase, and cursor save/restore. Pure sequences with no knowledge of the footer, input frame, or any layout.
 */

// Terminal geometry and the raw escape sequences the chrome is built from.
// Pure protocol: nothing here knows about the footer, the input frame, or any
// layout — callers compose these into the sequences they write.

const ESC = '\x1b[';

/** Current terminal height in rows, with a conservative fallback for a detached stdout. */
export function rows(): number { return process.stdout.rows || 24; }

/** Current terminal width in columns, with a conservative fallback for a detached stdout. */
export function cols(): number { return process.stdout.columns || 80; }

/**
 * DECSTBM — set the scroll region to rows `top`..`bottom` (1-based, inclusive).
 * Note that DECSTBM also homes the cursor to (1,1); wrap it in
 * `saveCursorSequence()` / `restoreCursorSequence()` when the caller's cursor
 * position still matters.
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

/** Erases the cursor's row without moving the cursor. */
export function clearLineSequence(): string {
  return `${ESC}2K`;
}

export function saveCursorSequence(): string {
  return `${ESC}s`;
}

export function restoreCursorSequence(): string {
  return `${ESC}u`;
}
