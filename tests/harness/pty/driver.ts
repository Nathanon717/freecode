// Drives a command through a real pseudo-terminal and renders its output with
// a headless VT emulator, so the rendered screen can be snapshotted as plain
// text. Nothing about the UI is reconstructed: whatever escape sequences the
// program emits are applied by the emulator, exactly as a real terminal would.
import { createRequire } from 'module';
import type { ScreenCell, ScreenRow } from './screen-assert.js';

const require = createRequire(import.meta.url);

export interface ReadOptions {
  /**
   * Keep blank rows at the end of the range. Off by default, since a viewport
   * is mostly empty; on when a block assertion needs the blank line that closes
   * a transcript step, which is otherwise trimmed away.
   */
  keepTrailingBlanks?: boolean;
}

export type ScreenScope = 'viewport' | 'scrollback';

export interface PtyDriverOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
}

export interface PtyDriver {
  send(data: string): void;
  /** Resize the PTY and the emulator viewport together, mirroring a real SIGWINCH. */
  resize(cols: number, rows: number): void;
  raw(): string;
  isExited(): boolean;
  exitCode(): number | null;
  waitForText(needle: string, timeoutMs?: number): Promise<boolean>;
  waitQuiet(quietMs?: number, timeoutMs?: number): Promise<void>;
  waitExit(timeoutMs?: number): Promise<boolean>;
  /** Wait for output to go quiet, then force the emulator to finish parsing. */
  settle(quietMs?: number): Promise<void>;
  /** The visible viewport, as plain-text rows (trailing blank rows trimmed). */
  snapshot(opts?: ReadOptions): string[];
  /** Scrollback + viewport, as plain-text rows (trailing blank rows trimmed). */
  transcript(opts?: ReadOptions): string[];
  /**
   * The same rows, with the colour and attribute of every cell behind them.
   * The emulator has carried these all along; this is what exposes them so a
   * test can assert the transcript's colours and not just its text.
   */
  cells(scope: ScreenScope, opts?: ReadOptions): ScreenRow[];
  /** Release the PTY, its conout worker thread, and the emulator. */
  kill(): void;
}

interface PtyProcess {
  onData(cb: (d: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

/**
 * node-pty's Windows agent owns a worker thread that drains the conout pipe, and
 * only ever disposes it from inside `kill()` — on the `useConptyDll` path via a
 * `data` listener that a child which has already exited will never fire. Reaching
 * for it is the only way to release that thread deterministically. Absent on Unix.
 */
function conoutWorkerOf(proc: PtyProcess): { dispose(): void } | undefined {
  const agent = (proc as { _agent?: { _conoutSocketWorker?: { dispose(): void } } })._agent;
  return agent?._conoutSocketWorker;
}

interface XtermCell {
  getChars(): string;
  getFgColor(): number;
  getFgColorMode(): number;
  /** Attribute getters return the raw bit, not a boolean — coerce before use. */
  isBold(): number;
  isDim(): number;
  isItalic(): number;
}
interface XtermLine {
  translateToString(trim: boolean): string;
  length: number;
  getCell(x: number): XtermCell | undefined;
}
interface XtermBuffer { baseY: number; length: number; getLine(i: number): XtermLine | null; }
interface XtermTerminal { write(data: string, cb?: () => void): void; resize(cols: number, rows: number): void; buffer: { active: XtermBuffer }; }

export function createPtyDriver(opts: PtyDriverOptions): PtyDriver {
  // Required lazily so importing this module never crashes when the native
  // node-pty addon is unavailable; the caller sees the error at spawn time.
  const pty = require('node-pty') as { spawn: (...args: unknown[]) => PtyProcess };
  const { Terminal } = require('@xterm/headless') as { Terminal: new (opts: Record<string, unknown>) => XtermTerminal };

  let cols = opts.cols ?? 80;
  let rows = opts.rows ?? 24;
  const term: XtermTerminal = new Terminal({ cols, rows, allowProposedApi: true });

  const proc: PtyProcess = pty.spawn(opts.command, opts.args, {
    name: 'xterm-color',
    cols,
    rows,
    cwd: opts.cwd,
    env: { TERM: 'xterm-color', ...opts.env },
    // On Windows, useConptyDll avoids fork()ing conpty_console_list_agent on
    // kill(), which otherwise briefly flashes a cmd window. It also selects the
    // host that scripts/install/pin-conpty.cjs pins — the kernel32 path this
    // would fall back to hangs a raw-key prompt waiting on its first keystroke
    // (docs/bug log/29-07-2026f.md), so don't flip this without reading that.
    useConptyDll: process.platform === 'win32',
  });

  let raw = '';
  let lastDataAt = Date.now();
  let exited = false;
  let killed = false;
  let code: number | null = null;

  proc.onData((d: string) => {
    // Late data can arrive after kill() disposed the emulator; writing to a
    // disposed Terminal throws.
    if (killed) return;
    raw += d;
    lastDataAt = Date.now();
    term.write(d);
  });
  proc.onExit((e: { exitCode: number }) => {
    exited = true;
    code = e?.exitCode ?? 0;
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const flush = () => new Promise<void>((resolve) => term.write('', () => resolve()));

  function readLines(from: number, count: number, opts?: ReadOptions): string[] {
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const line = buf.getLine(from + i);
      lines.push(line ? line.translateToString(true) : '');
    }
    if (!opts?.keepTrailingBlanks) {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    }
    return lines;
  }

  function readCells(from: number, count: number, opts?: ReadOptions): ScreenRow[] {
    const buf = term.buffer.active;
    const rows: ScreenRow[] = [];
    for (let i = 0; i < count; i++) {
      const line = buf.getLine(from + i);
      const text = line ? line.translateToString(true) : '';
      const cells: ScreenCell[] = [];
      for (let x = 0; line && x < text.length; x++) {
        const cell = line.getCell(x);
        if (!cell) break;
        cells.push({
          char: cell.getChars(),
          fg: cell.getFgColor(),
          fgMode: cell.getFgColorMode(),
          // The getters hand back the raw attribute bit (isDim() is 134217728,
          // not 1), so coerce here rather than in every assertion.
          bold: !!cell.isBold(),
          dim: !!cell.isDim(),
          italic: !!cell.isItalic(),
        });
      }
      rows.push({ text, cells });
    }
    if (!opts?.keepTrailingBlanks) {
      while (rows.length && rows[rows.length - 1].text.trim() === '') rows.pop();
    }
    return rows;
  }

  const rangeFor = (scope: ScreenScope): [number, number] =>
    scope === 'viewport'
      ? [term.buffer.active.baseY, rows]
      : [0, term.buffer.active.length];

  return {
    send: (data: string) => proc.write(data),
    resize: (nextCols: number, nextRows: number) => {
      cols = nextCols;
      rows = nextRows;
      term.resize(nextCols, nextRows);
      proc.resize(nextCols, nextRows);
    },
    raw: () => raw,
    isExited: () => exited,
    exitCode: () => code,

    async waitForText(needle, timeoutMs = 15000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (raw.includes(needle)) return true;
        if (exited) return raw.includes(needle);
        await sleep(30);
      }
      return raw.includes(needle);
    },

    async waitQuiet(quietMs = 250, timeoutMs = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (exited) return;
        if (Date.now() - lastDataAt >= quietMs) return;
        await sleep(25);
      }
    },

    async waitExit(timeoutMs = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (exited) return true;
        await sleep(25);
      }
      return exited;
    },

    async settle(quietMs = 350) {
      // Cap the quiet-wait well below the worst case. The footer redraws on a
      // ~1s heartbeat, so true silence longer than ~1s never occurs; without a
      // tight cap a step whose quietMs approaches/exceeds that interval would
      // burn the full timeout waiting for a gap that can't happen. waitFor
      // already guarantees the asserted content is present before we settle.
      await this.waitQuiet(quietMs, 2000);
      await flush();
      await sleep(60);
      await flush();
    },

    snapshot(opts) {
      return readLines(term.buffer.active.baseY, rows, opts);
    },

    transcript(opts) {
      return readLines(0, term.buffer.active.length, opts);
    },

    cells(scope, opts) {
      const [from, count] = rangeFor(scope);
      return readCells(from, count, opts);
    },

    // Release everything this driver owns, deterministically. A scenario whose
    // child exited on its own still holds a live ConPTY and a conout worker
    // thread: node-pty releases those only from `kill()`, so skipping it when
    // `exited` left one thread and one pseudoconsole per scenario alive for the
    // rest of the run — measured at 39 of 39 undisposed on `--only-tty`. This is
    // a leak fix, not a fix for the segfault in docs/bug log/29-07-2026e.md.
    kill() {
      if (killed) return;
      killed = true;
      try { proc.kill(); } catch { /* already gone */ }
      try { conoutWorkerOf(proc)?.dispose(); } catch { /* not on this platform */ }
      try { (term as { dispose?(): void }).dispose?.(); } catch { /* already disposed */ }
    },
  };
}
