# src/cli/chrome/ansi.ts - Terminal Geometry & Escape Sequences

<!-- BEGIN GENERATED MAP INTENT -->
## Role

The raw terminal protocol the bottom UI is built from — rows/columns, scroll-region (DECSTBM), cursor addressing, line erase, cursor save/restore — with no knowledge of the footer, input frame, or any layout. Every operation has a `…Sequence()` form returning the string, plus a writing form where a caller needs one; prefer the former so a frame goes out in one `process.stdout.write`.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Current terminal height in rows; falls back to 24 when stdout is not a TTY.
 */
rows(): number

/**
 * Current terminal width in columns; falls back to 80 when stdout is not a TTY.
 */
cols(): number

/**
 * DECSTBM — set the scroll region to rows `top`..`bottom` (1-based, inclusive).
 * Note that DECSTBM also homes the cursor to (1,1); wrap it in
 * `saveCursorSequence()` / `restoreCursorSequence()` when the caller's cursor
 * position still matters. A caller that absolute-positions immediately
 * afterwards (teardown, resize) does not need to.
 */
setScrollRegionSequence(top: number, bottom: number): string

setScrollRegion(top: number, bottom: number): void

/**
 * Drops the scroll region, restoring the full screen. Also homes the cursor.
 */
resetScrollRegionSequence(): string

resetScrollRegion(): void

moveToSequence(row: number, col: number): string

moveTo(row: number, col: number): void

/**
 * `\x1b[2K` — erases the cursor's row without moving the cursor or touching scrollback.
 */
clearLineSequence(): string

saveCursorSequence(): string

restoreCursorSequence(): string
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/chrome/bottom-ui.ts`](bottom-ui.md) ×65, [`cli/chrome/suggestion-overlay.ts`](suggestion-overlay.md) ×2

## Tests

`tests/cli/chrome/ansi.test.ts`.

## Budget

56 / 500 lines (444 to spare).
<!-- END GENERATED MAP FACTS -->

## Key neighbors

- `cli/chrome/bottom-ui.ts` — sole consumer; composes these into the footer, input frame, and suggestion overlay
- `util/screen-buffer.ts` — builds its own repaint sequences inline; its `hasCursorOrScreenControl` regex recognises the sequences emitted here so chrome writes are kept out of the transcript buffer
