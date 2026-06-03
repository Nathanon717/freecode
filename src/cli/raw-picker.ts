import type { Interface } from 'readline';
import { composeFooterOutput, drawFooter, getRows, resumeFooterTimer, suspendFooterTimer } from './terminal-ui.js';

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

export interface RawPickerOptions<T = void> {
  render: () => string[];
  onKey: (key: string, redraw: () => void, close: (result: T) => void) => void;
  /** Override line count used for erase-on-redraw (defaults to lines.length). Use for wrapping-aware counts. */
  countLines?: (lines: string[]) => number;
  /** Replaces the default line-erase sequence on cleanup. Receives the line count at close time. */
  onExitClear?: (rowCount: number) => void;
}

/**
 * Runs a raw-mode terminal picker.
 * Owns: raw-mode lifecycle, cursor hide/show, rl pause/resume, initial draw, drawFooter after each redraw.
 * Caller owns: rendering (render()), key handling (onKey()).
 * Resolves with whatever value is passed to close().
 */
export async function runRawPicker<T = void>(rl: Interface, opts: RawPickerOptions<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    let rowCount = 0;
    let closed = false;

    function redraw(): void {
      const lines = opts.render();
      let output = '';
      if (rowCount > 0) {
        // Clear only the menu rows (not footer) to avoid erasing and redrawing it.
        output += `\x1b[${rowCount}A\r`;
        for (let i = 0; i < rowCount; i++) {
          output += '\x1b[2K';
          if (i < rowCount - 1) output += '\n';
        }
        if (rowCount > 1) output += `\x1b[${rowCount - 1}A\r`;
      }
      output += lines.join('\n') + '\n';
      rowCount = opts.countLines ? opts.countLines(lines) : lines.length;
      // Append footer in the same write so the terminal sees one atomic update.
      output += composeFooterOutput();
      process.stdout.write(output);
    }

    function cleanup(): void {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      for (const listener of savedListeners) {
        process.stdin.on('data', listener);
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
    }

    function close(result: T): void {
      if (closed) return;
      closed = true;
      cleanup();
      resolve(result);
    }

    const onData = (key: string): void => {
      if (key === '\x03') {
        cleanup();
        process.exit(0);
      }
      opts.onKey(key, redraw, close);
    };

    rl.pause();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedListeners = process.stdin.rawListeners('data') as ((...args: any[]) => void)[];
    process.stdin.removeAllListeners('data');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    suspendFooterTimer();
    process.stdout.write('\x1b[?25l');

    // Move to the scroll-region bottom and scroll all old content above the
    // viewport so stale echoes don't remain visible above the picker menu.
    const r = getRows();
    process.stdout.write(`\x1b[${r - 2};1H` + '\n'.repeat(r - 2));

    redraw();

    process.stdin.on('data', onData);
  });
}
