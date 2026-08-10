# src/cli/chrome/input-buffer.ts - Input Buffer State

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Owns the mutable input buffer and cursor position used by the interactive prompt.

## Read When

Editing the interactive input area, cursor movement, or visual row/column calculations.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getInputBuffer(): string

getCursorPos(): number

/**
 * Replace the buffer and move the cursor to the end.
 */
setInputBuffer(input: string): void

insertAtCursor(text: string): void

backspaceAtCursor(): void

deleteAtCursor(): void

moveCursorLeft(): void

moveCursorRight(): void

/**
 * Place the caret at an absolute buffer offset, clamped into range. Used by the
 * hand-typed tool-call tabstop navigation (Tab / Backspace between value slots).
 */
setCursorPos(pos: number): void

moveCursorHome(): void

moveCursorEnd(): void

moveCursorUp(): void

moveCursorDown(): void

visualRowsForLine(content: string, w: number): number

cursorToVisualPos(buf: string, cursor: number, w: number): { visualRow: number; visualCol: number; }
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imported by:** [`cli/session-modes.ts`](../session-modes.md) ×35, [`cli/chrome/bottom-ui.ts`](bottom-ui.md) ×9

## Tests

`tests/cli/chrome/input-buffer.test.ts`. 2 other test files reference it.

## Budget

117 / 500 lines (383 to spare).
<!-- END GENERATED MAP FACTS -->
