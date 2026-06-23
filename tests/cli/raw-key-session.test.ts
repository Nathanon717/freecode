// check-tests: orphan — tests runRawKeySession, a new export from src/cli/raw-picker.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { runRawKeySession } from '../../src/cli/raw-picker.js';

// Minimal fake stdin matching the interface runRawKeySession calls.
class FakeStdin extends EventEmitter {
  rawMode: boolean[] = [];
  setRawMode(value: boolean): this {
    this.rawMode.push(value);
    return this;
  }
  resume(): this { return this; }
  pause(): this { return this; }
  setEncoding(): this { return this; }
}

describe('runRawKeySession', () => {
  let stdin: FakeStdin;
  let stdinDesc: PropertyDescriptor | undefined;

  beforeEach(() => {
    stdin = new FakeStdin();
    stdinDesc = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
  });

  afterEach(() => {
    if (stdinDesc) Object.defineProperty(process, 'stdin', stdinDesc);
  });

  it('enters raw mode immediately on creation', () => {
    const session = runRawKeySession<void>({
      onKey: () => {},
      onCtrlC: () => {},
    });

    expect(stdin.rawMode[0]).toBe(true);

    // Clean up: close with a dummy value so the promise resolves.
    session.close();
  });

  it('disables raw mode and restores prior listeners on close()', async () => {
    const preExisting = vi.fn();
    stdin.on('data', preExisting);

    const session = runRawKeySession<void>({
      onKey: () => {},
      onCtrlC: () => {},
    });

    // Primitive removed the pre-existing listener while active.
    expect(stdin.listeners('data')).not.toContain(preExisting);

    session.close();
    await session.promise;

    // Raw mode is off after close.
    expect(stdin.rawMode.at(-1)).toBe(false);
    // Pre-existing listener is restored and was never invoked by session keys.
    expect(stdin.listeners('data')).toContain(preExisting);
    expect(preExisting).not.toHaveBeenCalled();
  });

  it('dispatches non-Ctrl-C keys to onKey', () => {
    const keys: string[] = [];
    const session = runRawKeySession<void>({
      onKey: (key) => keys.push(key),
      onCtrlC: () => {},
    });

    stdin.emit('data', 'a');
    stdin.emit('data', '\x1b[A'); // up arrow escape sequence
    stdin.emit('data', 'z');

    expect(keys).toEqual(['a', '\x1b[A', 'z']);

    session.close();
  });

  it('resolves the promise with the value passed to close()', async () => {
    const session = runRawKeySession<string>({
      onKey: () => {},
      onCtrlC: () => {},
    });

    session.close('hello');
    await expect(session.promise).resolves.toBe('hello');
  });

  it('close() is idempotent — second call is a no-op', async () => {
    let closeCount = 0;
    const session = runRawKeySession<void>({
      onKey: () => {},
      onCtrlC: () => {},
      onClose: () => { closeCount++; },
    });

    session.close();
    session.close();
    await session.promise;

    expect(closeCount).toBe(1);
    // setRawMode should have been called twice total: true on start, false on close.
    expect(stdin.rawMode).toEqual([true, false]);
  });

  it('calls onClose after core cleanup but before the promise resolves', async () => {
    const events: string[] = [];

    const session = runRawKeySession<void>({
      onKey: () => {},
      onCtrlC: () => {},
      onClose: () => {
        // By the time onClose fires, raw mode must already be off.
        events.push(`rawMode=${String(stdin.rawMode.at(-1))}`);
        events.push('onClose');
      },
    });

    session.close();
    await session.promise;
    events.push('resolved');

    expect(events).toEqual(['rawMode=false', 'onClose', 'resolved']);
  });

  it('cleans up and calls onCtrlC when Ctrl-C is received', () => {
    const ctrlCHandler = vi.fn();

    void runRawKeySession<void>({
      onKey: () => {},
      onCtrlC: ctrlCHandler,
    });

    stdin.emit('data', '\x03');

    // Raw mode is off after Ctrl-C.
    expect(stdin.rawMode.at(-1)).toBe(false);
    // The caller's Ctrl-C hook was invoked.
    expect(ctrlCHandler).toHaveBeenCalledOnce();
  });

  it('does not dispatch Ctrl-C to onKey', () => {
    const keys: string[] = [];

    void runRawKeySession<void>({
      onKey: (key) => keys.push(key),
      onCtrlC: () => {},
    });

    stdin.emit('data', '\x03');

    expect(keys).toEqual([]);
  });
});
