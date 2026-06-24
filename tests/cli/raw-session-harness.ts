// Shared fixtures for tests that drive a raw-mode stdin session
// (runRawKeySession / runRawPicker / confirmToolCallInteractive) by faking
// process.stdin and emitting 'data' events.
//
// These tests fail by *timing out* when their choreography is wrong, so the
// helpers here exist to make the correct choreography the path of least
// resistance. Consumed by raw-key-session.test.ts, raw-picker.test.ts, and
// tool-approval.test.ts.
//
// Not a test file (no `.test.ts` suffix), so the runner ignores it.
import { EventEmitter } from 'events';

// A fake stdin that behaves like an EventEmitter (so on/removeListener/
// rawListeners work) plus the TTY-control methods the raw-session code calls.
// `rawMode` records every setRawMode() call so tests can assert the lifecycle.
export class FakeStdin extends EventEmitter {
  isTTY: boolean;
  rawMode: boolean[] = [];

  constructor(isTTY = false) {
    super();
    this.isTTY = isTTY;
  }

  setRawMode(value: boolean): this {
    this.rawMode.push(value);
    return this;
  }
  resume(): this { return this; }
  pause(): this { return this; }
  setEncoding(): this { return this; }

  /** Emit a sequence of keypresses synchronously, in order. */
  type(...keys: string[]): void {
    for (const key of keys) this.emit('data', key);
  }
}

export interface FakeStdout {
  out: string;
  columns: number;
  rows: number;
  write(s: string): boolean;
}

export function makeFakeStdout(columns = 80, rows = 24): FakeStdout {
  return {
    out: '',
    columns,
    rows,
    write(s: string) {
      this.out += s;
      return true;
    },
  };
}

export interface ProcessStreamFixture {
  stdin: FakeStdin;
  /** Present only when `stdout: true` was passed. */
  stdout?: FakeStdout;
  /** Restores the real process.stdin/stdout. Call from afterEach. */
  restore(): void;
}

// Swaps process.stdin (and optionally process.stdout) for fakes and returns a
// handle whose restore() puts the originals back. Call in beforeEach, restore
// in afterEach. When you only need to assert on writes, leave `stdout` off and
// spy on process.stdout.write instead.
export function installProcessStreams(
  opts: { tty?: boolean; stdout?: boolean } = {},
): ProcessStreamFixture {
  const stdin = new FakeStdin(opts.tty ?? false);
  const stdinDesc = Object.getOwnPropertyDescriptor(process, 'stdin');
  Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });

  let stdout: FakeStdout | undefined;
  let stdoutDesc: PropertyDescriptor | undefined;
  if (opts.stdout) {
    stdout = makeFakeStdout();
    stdoutDesc = Object.getOwnPropertyDescriptor(process, 'stdout');
    Object.defineProperty(process, 'stdout', { value: stdout, configurable: true });
  }

  return {
    stdin,
    stdout,
    restore() {
      if (stdinDesc) Object.defineProperty(process, 'stdin', stdinDesc);
      if (stdoutDesc) Object.defineProperty(process, 'stdout', stdoutDesc);
    },
  };
}

// Flushes pending micro- and macrotasks so one raw session can finish closing
// and hand stdin off to the next (e.g. the approve/deny menu closing and the
// deny-message session opening). `await flush()` between those two emits.
export function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Wraps a promise that is intentionally still pending (a raw session parked
// waiting for more input) so an async helper can return it without adopting
// and awaiting it. Returning the bare promise from an `async` function makes
// the function's own promise adopt it, so `await helper()` would block forever
// on input that has not been sent yet. Return `box(promise)` instead and have
// callers destructure `{ promise }`.
export function box<T>(promise: Promise<T>): { promise: Promise<T> } {
  return { promise };
}
