import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';
import { runConfigCommand } from '../../src/commands/config.js';

const fakeRl = { pause: vi.fn(), resume: vi.fn() } as unknown as Interface;

describe('runConfigCommand', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    vi.restoreAllMocks();
  });

  it('prints an error and returns immediately when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    await runConfigCommand(fakeRl);

    expect(logged.some(l => l.includes('interactive terminal'))).toBe(true);
  });
});
