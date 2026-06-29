# src/cli/raw-picker.ts - Shared Raw-Mode Picker

**Role:** Provides the shared raw-mode terminal picker primitive used by `/model`, `/config`, and `/eval`. Also exports `runRawKeySession`, the low-level stdin raw-mode lifecycle primitive that `runRawPicker` is built on.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
countWrappedLines(lines: string[]): number

resetTerminalPrivateModes(): void

resetStdinConsoleMode(): void

interface RawKeySessionCallbacks {
  /** Called for every key that is NOT Ctrl-C. */
  onKey: (key: string) => void;
  /**
   * Called when Ctrl-C is received. The primitive has already cleaned up
   * (raw mode off, prior listeners restored) before this fires. Must
   * include any process.exit() or other Ctrl-C teardown the caller needs.
   */
  onCtrlC: () => void;
  /**
   * Called after the session cleans up (raw mode off, prior listeners
   * restored) but before the promise resolves. Use it for cursor show,
   * footer restore, readline resume, etc.
   */
  onClose?: () => void;
}

interface RawKeySession<T> {
  /** Resolves the session promise with the given value after cleanup. */
  close: (value: T) => void;
  /** Resolves when close() is called. */
  promise: Promise<T>;
}

runRawKeySession<T = void>(callbacks: RawKeySessionCallbacks): RawKeySession<T>

interface RawPickerOptions<T = void> {
  render: () => string[];
  onKey: (key: string, redraw: () => void, close: (result: T) => void) => void;
  /** Override line count used for erase-on-redraw (defaults to lines.length). Use for wrapping-aware counts. */
  countLines?: (lines: string[]) => number;
  /** Replaces the default line-erase sequence on cleanup. Receives the line count at close time. */
  onExitClear?: (rowCount: number) => void;
  /** Skip the viewport scroll-clear that normally pushes prior output off-screen before the picker draws. */
  skipScrollClear?: boolean;
  /** Draw the picker from row 1 on every frame instead of at the current cursor. */
  pinToTop?: boolean;
  /** Returns a controls string to pin to the last row above the footer, or undefined to skip. Styled by the caller. */
  getControls?: () => string | undefined;
}

runRawPicker<T = void>(rl: Interface, opts: RawPickerOptions<T>): Promise<T>
```
<!-- END GENERATED EXPORTS -->

## Responsibilities

`runRawKeySession` owns the bare stdin lifecycle:
- Snapshot and remove pre-existing 'data' listeners; `setRawMode(true)` / `resume()` / `setEncoding('utf8')`.
- Dispatch non-Ctrl-C keys to `onKey`; on Ctrl-C, do core cleanup then call `onCtrlC`.
- On `close(value)`: core cleanup (raw off, listeners restored), then `onClose?.()`, then resolve.

`runRawPicker` owns the higher-level picker concerns:
- Cursor hide/show, footer suspend/resume/redraw, viewport scroll-clear, row erase on exit.
- Handles Ctrl+C (`\x03`) → caller's `onCtrlC` which calls `extraCleanup` + `process.exit(0)`.
- Restores cooked mode, cursor, readline, and flowing stdin via `onClose`.

## Caller responsibilities (runRawPicker)

- `render()`: returns an array of lines to display.
- `onKey()`: handles all keys. Calls `redraw()` to update the screen or `close(result)` to exit.
- `countLines` (optional): wrapping-aware line count for terminals narrower than the content (used by `/config`).
- `onExitClear` (optional): replaces the default `\x1b[${rowCount}A\r\x1b[J` erase on exit. Used by `/config` to reset/restore the scroll region (Windows ConPTY workaround).
- `skipScrollClear` (optional): skip the viewport scroll-clear before first draw.
- `pinToTop` (optional): draw frames with absolute row positioning from viewport row 1 and cap rendered rows to the footer-free region. Used by tabbed `list-menu` screens so the tab chrome stays pinned. Also registers a `setOnResizeCallback` so the picker repaints on top after the terminal-ui resize handler clears the screen and redraws the banner.
- `getControls` (optional): returns a styled controls hint string (or `undefined`) to be written atomically to the last row above the footer using absolute positioning. On exit, `extraCleanup` explicitly clears that row before restoring the footer.

## Read when

- Changing the raw-mode lifecycle shared by the pickers.
- Adding a new interactive picker command.
- Implementing Phase 3 (session-modes.ts) to reuse `runRawKeySession`.

## Key neighbors

- `commands/model.ts` — `/model` picker
- `commands/config.ts` — `/config` editor
- `cli/custom-eval-menu.ts` — `/eval` picker
- `cli/terminal-ui.ts` — `drawFooter` called after each redraw
- `cli/tool-approval.ts` — uses `runRawKeySession` for the Approve/Deny menu and line-editor (Phase 2 done)
- `cli/session-modes.ts` — Phase 3 target
