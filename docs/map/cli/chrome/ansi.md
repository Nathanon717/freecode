# src/cli/chrome/ansi.ts - Terminal Geometry & Escape Sequences

**Role:** The raw terminal protocol the bottom UI is built from — current rows/columns, scroll-region (DECSTBM), cursor addressing, line erase, and cursor save/restore. Pure sequences with no knowledge of the footer, input frame, or any layout.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
rows(): number

cols(): number

setScrollRegionSequence(top: number, bottom: number): string

setScrollRegion(top: number, bottom: number): void

resetScrollRegionSequence(): string

resetScrollRegion(): void

moveToSequence(row: number, col: number): string

moveTo(row: number, col: number): void

clearLineSequence(): string

saveCursorSequence(): string

restoreCursorSequence(): string
```
<!-- END GENERATED EXPORTS -->

## Export notes

- Each operation comes in a `…Sequence()` form that returns the string and, where a caller needs it, a writing form. Prefer the `…Sequence()` form when building one batched `process.stdout.write` — a single write keeps the terminal from painting a half-updated frame.
- `rows()` / `cols()` fall back to 24×80 when stdout is not a TTY, so callers never divide by an undefined geometry.
- `setScrollRegionSequence` / `setScrollRegion` — **DECSTBM also homes the cursor to (1,1).** Any caller whose cursor position still matters must bracket it with `saveCursorSequence()` / `restoreCursorSequence()`; `setupFooterUI` does exactly this so the startup banner is not overwritten by the next `console.log`. Callers that immediately absolute-position afterwards (teardown, resize) don't need to.
- `clearLineSequence()` is `\x1b[2K` — erases the cursor's row without moving the cursor, and without touching the scrollback.

## Key neighbors

- `cli/chrome/bottom-ui.ts` — sole consumer; composes these into the footer, input frame, and suggestion overlay
- `util/screen-buffer.ts` — builds its own repaint sequences inline; its `hasCursorOrScreenControl` regex recognises the sequences emitted here so chrome writes are kept out of the transcript buffer
