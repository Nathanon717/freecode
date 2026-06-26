# src/cli/input-buffer.ts - Input Buffer State

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

moveCursorHome(): void

moveCursorEnd(): void

moveCursorUp(): void

moveCursorDown(): void

visualRowsForLine(content: string, w: number): number

cursorToVisualPos(buf: string, cursor: number, w: number): { visualRow: number; visualCol: number; }
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `getInputBuffer()` — current flat buffer string (newlines embedded for multi-line).
- `getCursorPos()` — current cursor index within the flat buffer.
- `setInputBuffer(input)` — replaces buffer and moves cursor to end.
- `visualRowsForLine` / `cursorToVisualPos` — used by `terminal-ui.ts` to convert buffer positions to screen coordinates.

## Read when

Editing the interactive input area, cursor movement, or visual row/column calculations.

## Key neighbors

- `cli/terminal-ui.ts` — imports from here for rendering; re-exports everything for backwards-compat callers
- `cli/session-modes.ts` — calls all cursor/buffer mutations in response to keystrokes
