import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import chalk from 'chalk';
import type { Interface } from 'readline';
import { countWrappedLines, runRawPicker } from '../../src/cli/raw-picker.js';
import {
  type FakeStdin,
  type FakeStdout,
  installProcessStreams,
  type ProcessStreamFixture,
} from './raw-session-harness.js';

// Raw-session tests fail by timing out; cap them low so a wedged session fails
// fast instead of after the 15s global default.
vi.setConfig({ testTimeout: 2000 });

describe('countWrappedLines', () => {
  let originalColumns: number | undefined;

  beforeEach(() => {
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, 'columns', { value: originalColumns, configurable: true });
  });

  function setColumns(n: number): void {
    Object.defineProperty(process.stdout, 'columns', { value: n, configurable: true });
  }

  it('returns 0 for no lines', () => {
    expect(countWrappedLines([])).toBe(0);
  });

  it('counts a short line as a single row', () => {
    setColumns(80);
    expect(countWrappedLines(['hello'])).toBe(1);
  });

  it('counts a blank line as one row, not zero', () => {
    setColumns(80);
    expect(countWrappedLines([''])).toBe(1);
  });

  it('counts soft-wrapped rows for lines wider than the terminal', () => {
    setColumns(10);
    expect(countWrappedLines(['x'.repeat(25)])).toBe(3); // ceil(25/10)
  });

  it('ignores ANSI color codes when measuring width', () => {
    setColumns(10);
    // 8 visible chars dressed in color codes must still count as a single row.
    expect(countWrappedLines([chalk.red(chalk.bold('12345678'))])).toBe(1);
  });

  it('sums wrapped rows across multiple lines', () => {
    setColumns(10);
    expect(countWrappedLines(['short', 'x'.repeat(21)])).toBe(1 + 3);
  });
});

describe('runRawPicker', () => {
  let stdin: FakeStdin;
  let stdout: FakeStdout;
  let streams: ProcessStreamFixture;

  beforeEach(() => {
    streams = installProcessStreams({ stdout: true });
    stdin = streams.stdin;
    stdout = streams.stdout!;
  });

  afterEach(() => {
    streams.restore();
  });

  // Minimal readline.Interface stub: runRawPicker only calls rl.resume() on cleanup.
  const rl = { resume: () => {} } as unknown as Interface;

  it('renders the initial frame and resolves with the value passed to close()', async () => {
    const promise = runRawPicker<string>(rl, {
      skipScrollClear: true,
      render: () => ['option line'],
      onKey: (key, _redraw, close) => {
        if (key === 'q') close('chosen');
      },
    });

    expect(stdout.out).toContain('option line');

    stdin.emit('data', 'q');
    await expect(promise).resolves.toBe('chosen');
  });

  it('re-renders when onKey calls redraw()', async () => {
    let renderCount = 0;
    const promise = runRawPicker<void>(rl, {
      skipScrollClear: true,
      render: () => {
        renderCount++;
        return [`render #${renderCount}`];
      },
      onKey: (key, redraw, close) => {
        if (key === 'r') redraw();
        if (key === 'q') close();
      },
    });

    expect(renderCount).toBe(1); // initial draw
    stdin.emit('data', 'r');
    expect(renderCount).toBe(2);
    expect(stdout.out).toContain('render #2');

    stdin.emit('data', 'q');
    await promise;
  });

  it('enables raw mode on start and disables it on cleanup', async () => {
    const promise = runRawPicker<void>(rl, {
      skipScrollClear: true,
      render: () => ['x'],
      onKey: (_key, _redraw, close) => close(),
    });

    expect(stdin.rawMode[0]).toBe(true);
    stdin.emit('data', 'q');
    await promise;
    expect(stdin.rawMode.at(-1)).toBe(false);
  });

  it('removes pre-existing data listeners while active and restores them on cleanup', async () => {
    const preExisting = vi.fn();
    stdin.on('data', preExisting);

    const promise = runRawPicker<void>(rl, {
      skipScrollClear: true,
      render: () => ['x'],
      onKey: (key, _redraw, close) => {
        if (key === 'q') close();
      },
    });

    // While the picker owns stdin, the original listener must not be registered.
    expect(stdin.listeners('data')).not.toContain(preExisting);

    stdin.emit('data', 'q');
    await promise;

    // After cleanup the original listener is back and was never invoked by picker input.
    expect(stdin.listeners('data')).toContain(preExisting);
    expect(preExisting).not.toHaveBeenCalled();
  });

  it('cleans up and exits the process on Ctrl-C', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit-called');
    }));

    void runRawPicker<void>(rl, {
      skipScrollClear: true,
      render: () => ['x'],
      onKey: () => {},
    });

    expect(() => stdin.emit('data', '\x03')).toThrow('exit-called');
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdin.rawMode.at(-1)).toBe(false); // cleanup ran before exit

    exitSpy.mockRestore();
  });
});
