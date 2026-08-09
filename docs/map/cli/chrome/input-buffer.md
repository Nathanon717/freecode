# src/cli/chrome/input-buffer.ts - Input Buffer State

**Role:** Owns the mutable input buffer and cursor position used by the interactive prompt.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getInputBuffer(): string

getCursorPos(): number

setInputBuffer(input: string): void

insertAtCursor(text: string): void

backspaceAtCursor(): void

deleteAtCursor(): void

moveCursorLeft(): void

moveCursorRight(): void

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

114 / 500 lines (386 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `getInputBuffer()` — current flat buffer string (newlines embedded for multi-line).
- `getCursorPos()` — current cursor index within the flat buffer.
- `setInputBuffer(input)` — replaces buffer and moves cursor to end.
- `setCursorPos(pos)` — places the caret at a clamped absolute offset; used by tool-call tabstop navigation in `session-modes.ts`.
- `visualRowsForLine` / `cursorToVisualPos` — used by `bottom-ui.ts` to convert buffer positions to screen coordinates.

## Read when

Editing the interactive input area, cursor movement, or visual row/column calculations.

## Key neighbors

- `cli/chrome/bottom-ui.ts` — imports from here for rendering
- `cli/session-modes.ts` — imports the buffer/cursor functions directly for key handling
- `cli/session-modes.ts` — calls all cursor/buffer mutations in response to keystrokes
