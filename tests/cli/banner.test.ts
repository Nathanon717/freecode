import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEntireTerminal } from '../../src/cli/banner.js';

describe('clearEntireTerminal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets terminal margins, clears scrollback and screen, and returns the cursor home', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    clearEntireTerminal();

    expect(write).toHaveBeenCalledWith('\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[3J\x1b[H');
  });
});
