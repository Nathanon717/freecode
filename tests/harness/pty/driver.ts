// Drives a command through a real pseudo-terminal and renders its output with
// a headless VT emulator, so the rendered screen can be snapshotted as plain
// text. Nothing about the UI is reconstructed: whatever escape sequences the
// program emits are applied by the emulator, exactly as a real terminal would.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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
  raw(): string;
  isExited(): boolean;
  exitCode(): number | null;
  waitForText(needle: string, timeoutMs?: number): Promise<boolean>;
  waitQuiet(quietMs?: number, timeoutMs?: number): Promise<void>;
  waitExit(timeoutMs?: number): Promise<boolean>;
  /** Wait for output to go quiet, then force the emulator to finish parsing. */
  settle(quietMs?: number): Promise<void>;
  /** The visible viewport, as plain-text rows (trailing blank rows trimmed). */
  snapshot(): string[];
  /** Scrollback + viewport, as plain-text rows (trailing blank rows trimmed). */
  transcript(): string[];
  kill(): void;
}

export function createPtyDriver(opts: PtyDriverOptions): PtyDriver {
  // Required lazily so importing this module never crashes when the native
  // node-pty addon is unavailable; the caller sees the error at spawn time.
  const pty = require('node-pty');
  const { Terminal } = require('@xterm/headless');

  const cols = opts.cols ?? 80;
  const rows = opts.rows ?? 24;
  const term = new Terminal({ cols, rows, allowProposedApi: true });

  const proc = pty.spawn(opts.command, opts.args, {
    name: 'xterm-color',
    cols,
    rows,
    cwd: opts.cwd,
    env: { TERM: 'xterm-color', ...opts.env },
    // On Windows, useConptyDll avoids fork()ing conpty_console_list_agent on
    // kill(), which otherwise briefly flashes a cmd window.
    useConptyDll: process.platform === 'win32',
  });

  let raw = '';
  let lastDataAt = Date.now();
  let exited = false;
  let code: number | null = null;

  proc.onData((d: string) => {
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

  function readLines(from: number, count: number): string[] {
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
      const line = buf.getLine(from + i);
      lines.push(line ? line.translateToString(true) : '');
    }
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    return lines;
  }

  return {
    send: (data: string) => proc.write(data),
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
      await this.waitQuiet(quietMs, 6000);
      await flush();
      await sleep(60);
      await flush();
    },

    snapshot() {
      return readLines(term.buffer.active.baseY, rows);
    },

    transcript() {
      return readLines(0, term.buffer.active.length);
    },

    kill() {
      if (!exited) {
        try { proc.kill(); } catch { /* already gone */ }
      }
    },
  };
}
