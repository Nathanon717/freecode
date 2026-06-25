# src/cli/input-buffer.ts - Input Buffer State

**Role:** Owns the mutable input buffer and cursor position used by the interactive prompt.

## Exports

State access:

- `getInputBuffer()` — current flat buffer string (newlines embedded for multi-line)
- `getCursorPos()` — current cursor index within the flat buffer
- `setInputBuffer(input)` — replace buffer and move cursor to end

Cursor-aware mutations:

- `insertAtCursor(text)`, `backspaceAtCursor()`, `deleteAtCursor()`
- `moveCursorLeft()`, `moveCursorRight()`, `moveCursorHome()`, `moveCursorEnd()`, `moveCursorUp()`, `moveCursorDown()`

Visual layout helpers (used by `terminal-ui.ts` to convert buffer positions to screen coordinates):

- `visualRowsForLine(content, w)` — number of terminal rows a logical line occupies
- `cursorToVisualPos(buf, cursor, w)` — maps flat cursor index to `{ visualRow, visualCol }`

## Read when

Editing the interactive input area, cursor movement, or visual row/column calculations.

## Key neighbors

- `cli/terminal-ui.ts` — imports from here for rendering; re-exports everything for backwards-compat callers
- `cli/session-modes.ts` — calls all cursor/buffer mutations in response to keystrokes
