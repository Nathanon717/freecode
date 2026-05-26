# src/cli/raw-picker.ts - Shared Raw-Mode Picker

**Role:** Provides the shared raw-mode terminal picker primitive used by `/model`, `/config`, and `/eval`.

## Exports

```typescript
interface RawPickerOptions<T = void> {
  render: () => string[];
  onKey: (key: string, redraw: () => void, close: (result: T) => void) => void;
  countLines?: (lines: string[]) => number;
  onExitClear?: (rowCount: number) => void;
}

runRawPicker<T = void>(rl: Interface, opts: RawPickerOptions<T>): Promise<T>
```

## Responsibilities

Owns the raw-mode lifecycle so callers don't repeat it:

- Pauses readline, enters raw mode, hides cursor.
- Calls `render()` on each `redraw()` and after `drawFooter()`.
- Handles Ctrl+C (`\x03`) → cleanup + `process.exit(0)`.
- Restores raw mode, cursor, and readline on `close()`.

## Caller responsibilities

- `render()`: returns an array of lines to display.
- `onKey()`: handles all keys except Ctrl+C. Calls `redraw()` to update the screen or `close(result)` to exit.
- `countLines` (optional): wrapping-aware line count for terminals narrower than the content (used by `/config`).
- `onExitClear` (optional): replaces the default `\x1b[${rowCount}A\r\x1b[J` erase on exit. Used by `/config` to reset/restore the scroll region around the clear (Windows ConPTY workaround).

## Read when

- Changing the raw-mode lifecycle shared by the three pickers.
- Adding a new interactive picker command.

## Key neighbors

- `commands/model.ts` — `/model` picker
- `commands/config.ts` — `/config` editor
- `cli/scenario-menu.ts` — `/eval` picker
- `cli/terminal-ui.ts` — `drawFooter` called after each redraw
