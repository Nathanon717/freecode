import type { Interface } from 'readline';
import { composeFooterOutput, drawFooter, getLastReservedRows, getRows, resumeFooterTimer, suspendFooterTimer } from './terminal-ui.js';

// Counts the actual terminal rows a set of rendered lines occupies, accounting
// for soft-wrapping at the current terminal width. Use this as `countLines` in
// RawPickerOptions when lines may exceed 80 columns.
export function countWrappedLines(lines: string[]): number {
  const w = process.stdout.columns || 80;
  let total = 0;
  for (const line of lines) {
    const visible = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    total += Math.max(1, Math.ceil(visible / w));
  }
  return total;
}

// Restores cooked-mode terminal state after a raw-mode picker: re-enables the
// cursor, disables mouse/bracketed-paste tracking, and clears the scroll region.
export function resetTerminalPrivateModes(): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(
    "\x1b[0m" +
      "\x1b[?25h" +
      "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l" +
      "\x1b[?2004l" +
      "\x1b[r",
  );
}

// Cycles stdin raw mode to flush any wedged console input state on Windows.
export function resetStdinConsoleMode(): void {
  if (!process.stdin.isTTY) return;
  process.stdin.setRawMode(false);
  process.stdin.resume();
  process.stdin.setRawMode(true);
  process.stdin.setRawMode(false);
  process.stdin.resume();
}

export interface RawKeySessionCallbacks {
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

export interface RawKeySession<T> {
  /** Resolves the session promise with the given value after cleanup. */
  close: (value: T) => void;
  /** Resolves when close() is called. */
  promise: Promise<T>;
}

/**
 * Low-level stdin raw-mode lifecycle primitive.
 *
 * Owns:
 *   1. Snapshot and remove pre-existing 'data' listeners.
 *   2. setRawMode(true) / resume() / setEncoding('utf8').
 *   3. Internal 'data' handler: dispatches Ctrl-C to onCtrlC (after cleanup),
 *      every other key to onKey.
 *   4. close(value): removes the internal handler, setRawMode(false), restores
 *      saved listeners, calls onClose, then resolves the promise.
 *
 * Does NOT own: cursor visibility, footer management, viewport scrolling,
 * readline interface, or any other caller-specific concern. Those belong in
 * onClose / onCtrlC.
 */
export function runRawKeySession<T = void>(callbacks: RawKeySessionCallbacks): RawKeySession<T> {
  let closed = false;
  let resolvePromise!: (value: T) => void;

  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedListeners = process.stdin.rawListeners('data') as ((...args: any[]) => void)[];
  process.stdin.removeAllListeners('data');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  function coreCleanup(): void {
    process.stdin.removeListener('data', onData);
    process.stdin.setRawMode(false);
    for (const listener of savedListeners) {
      process.stdin.on('data', listener);
    }
  }

  const onData = (key: string): void => {
    if (key === '\x03') {
      coreCleanup();
      callbacks.onCtrlC();
      return;
    }
    callbacks.onKey(key);
  };

  process.stdin.on('data', onData);

  function close(value: T): void {
    if (closed) return;
    closed = true;
    coreCleanup();
    callbacks.onClose?.();
    resolvePromise(value);
  }

  return { close, promise };
}

export interface RawPickerOptions<T = void> {
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

/**
 * Runs a raw-mode terminal picker.
 * Owns: raw-mode lifecycle (via runRawKeySession), cursor hide/show,
 * readline listener restore, initial draw, drawFooter after each redraw.
 * Caller owns: rendering (render()), key handling (onKey()).
 * Resolves with whatever value is passed to close().
 */
export async function runRawPicker<T = void>(rl: Interface, opts: RawPickerOptions<T>): Promise<T> {
  let rowCount = 0;

  function redraw(): void {
    const lines = opts.render();
    let output = '';
    if (opts.pinToTop) {
      const availableRows = Math.max(0, getRows() - getLastReservedRows());
      const clearRows = Math.max(rowCount, availableRows);
      const visibleRows = availableRows;
      output += '\x1b[?7l';
      for (let i = 0; i < clearRows; i++) {
        output += `\x1b[${i + 1};1H\x1b[2K`;
      }
      const visibleLines = lines.slice(0, Math.max(0, visibleRows));
      for (let i = 0; i < visibleLines.length; i++) {
        output += `\x1b[${i + 1};1H${visibleLines[i]}`;
      }
      // Autowrap stays OFF through the controls + footer writes below; otherwise
      // an over-long controls hint written near the bottom row wraps past the
      // last line and scrolls the pinned screen up by one, eating the top row.
      // Re-enabled at the very end so subsequent normal output wraps as usual.
    } else if (rowCount > 0) {
      // Clear only the menu rows (not footer) to avoid erasing and redrawing it.
      output += `\x1b[${rowCount}A\r`;
      for (let i = 0; i < rowCount; i++) {
        output += '\x1b[2K';
        if (i < rowCount - 1) output += '\n';
      }
      if (rowCount > 1) output += `\x1b[${rowCount - 1}A\r`;
    }
    if (!opts.pinToTop) output += lines.join('\n') + '\n';
    rowCount = opts.pinToTop
      ? Math.min(opts.countLines ? opts.countLines(lines) : lines.length, Math.max(0, getRows() - getLastReservedRows()))
      : opts.countLines ? opts.countLines(lines) : lines.length;
    const ctrl = opts.getControls?.();
    if (ctrl !== undefined) {
      const targetRow = getRows() - getLastReservedRows();
      output += `\x1b[${targetRow};1H\x1b[2K${ctrl}`;
    }
    // Append footer in the same write so the terminal sees one atomic update.
    output += composeFooterOutput();
    if (opts.pinToTop) output += '\x1b[?7h';
    process.stdout.write(output);
  }

  function extraCleanup(): void {
    if (opts.getControls) {
      const targetRow = getRows() - getLastReservedRows();
      process.stdout.write(`\x1b[${targetRow};1H\x1b[2K`);
    }
    if (rowCount > 0) {
      if (opts.onExitClear) {
        opts.onExitClear(rowCount);
      } else {
        process.stdout.write(`\x1b[${rowCount}A\r\x1b[J`);
      }
    }
    process.stdout.write('\x1b[?25h');
    resumeFooterTimer();
    drawFooter();
    rl.resume();
    process.stdin.resume();
  }

  suspendFooterTimer();
  process.stdout.write('\x1b[?25l');

  if (!opts.skipScrollClear && !opts.pinToTop) {
    // Move to the scroll-region bottom and scroll all old content above the
    // viewport so stale echoes don't remain visible above the picker menu.
    const r = getRows();
    process.stdout.write(`\x1b[${r - 2};1H` + '\n'.repeat(r - 2));
  }

  const session = runRawKeySession<T>({
    onKey: (key) => {
      opts.onKey(key, redraw, session.close);
    },
    onCtrlC: () => {
      extraCleanup();
      process.exit(0);
    },
    onClose: extraCleanup,
  });

  redraw();
  return session.promise;
}
