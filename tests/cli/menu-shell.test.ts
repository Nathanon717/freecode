import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../src/cli/terminal-ui.js', () => ({
  isBottomUIActive: vi.fn().mockReturnValue(true),
  setupBottomUI: vi.fn(),
  teardownBottomUI: vi.fn(),
}));

vi.mock('../../src/cli/raw-picker.js', () => ({
  resetStdinConsoleMode: vi.fn(),
  resetTerminalPrivateModes: vi.fn(),
}));

import { runMenuShell } from '../../src/cli/menu-shell.js';
import { isBottomUIActive, setupBottomUI, teardownBottomUI } from '../../src/cli/terminal-ui.js';
import { resetStdinConsoleMode, resetTerminalPrivateModes } from '../../src/cli/raw-picker.js';

const rlPause = vi.fn();
const rlResume = vi.fn();
const fakeRl = { pause: rlPause, resume: rlResume } as unknown as Interface;

const originalIsTTY = process.stdin.isTTY;
function setTty(v: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: v, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isBottomUIActive).mockReturnValue(true);
  setTty(true);
});

afterEach(() => {
  Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
});

describe('runMenuShell', () => {
  it('awaits ensureReady before tearing down the bottom UI', async () => {
    const order: string[] = [];
    const ensureReady = (): Promise<void> => { order.push('ensureReady'); return Promise.resolve(); };
    vi.mocked(teardownBottomUI).mockImplementation(() => { order.push('teardown'); });

    await runMenuShell(fakeRl, {
      ensureReady,
      run: () => { order.push('run'); return Promise.resolve(); },
    });

    expect(order).toEqual(['ensureReady', 'teardown', 'run']);
  });

  it('tears down, resumes rl, then runs the body and returns its value', async () => {
    const result = await runMenuShell(fakeRl, { run: () => Promise.resolve(42) });
    expect(teardownBottomUI).toHaveBeenCalledOnce();
    expect(rlResume).toHaveBeenCalledOnce();
    expect(result).toBe(42);
  });

  it('restores terminal state in finally when bottom UI was active on a TTY', async () => {
    const onRestore = vi.fn();
    await runMenuShell(fakeRl, { run: () => Promise.resolve(), onRestore });

    expect(rlPause).toHaveBeenCalledOnce();
    expect(resetStdinConsoleMode).toHaveBeenCalledOnce();
    expect(resetTerminalPrivateModes).toHaveBeenCalledOnce();
    expect(setupBottomUI).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it('skips the bottom-UI restore when the bottom UI was not active', async () => {
    vi.mocked(isBottomUIActive).mockReturnValue(false);
    const onRestore = vi.fn();
    await runMenuShell(fakeRl, { run: () => Promise.resolve(), onRestore });

    expect(rlPause).toHaveBeenCalledOnce();
    expect(setupBottomUI).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('skips the bottom-UI restore when stdin is not a TTY', async () => {
    setTty(false);
    await runMenuShell(fakeRl, { run: () => Promise.resolve() });
    expect(setupBottomUI).not.toHaveBeenCalled();
  });

  it('still restores when the body throws, and propagates the error', async () => {
    const boom = new Error('boom');
    await expect(
      runMenuShell(fakeRl, { run: () => Promise.reject(boom) }),
    ).rejects.toBe(boom);

    expect(rlPause).toHaveBeenCalledOnce();
    expect(setupBottomUI).toHaveBeenCalledOnce();
  });
});
