import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installScreenBuffer, getScreenBuffer } from '../src/util/screen-buffer.js';

// The buffer hooks process.stdout.write once per module instance. vitest isolates
// modules per test file, so this file owns its own buffer instance. We write
// unique tokens and assert on those rather than the whole buffer, since other
// stdout traffic in this process may also land in the buffer.
describe('screen buffer', () => {
  // Stub the underlying write before the buffer installs over it, so the test
  // tokens we emit are still recorded by the buffer but never reach the terminal.
  let writeSpy: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterAll(() => {
    writeSpy.mockRestore();
  });

  it('records written lines so they can be read back', () => {
    installScreenBuffer();
    const token = `sb-basic-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`${token}\n`);
    expect(getScreenBuffer()).toContain(token);
  });

  it('strips ANSI escape codes before storing', () => {
    installScreenBuffer();
    const token = `sb-ansi-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`\x1b[32m${token}\x1b[0m\n`);
    const buffer = getScreenBuffer();
    expect(buffer).toContain(token);
    expect(buffer).not.toContain('\x1b[32m');
  });

  it('collapses consecutive identical lines', () => {
    installScreenBuffer();
    const token = `sb-dup-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`${token}\n${token}\n${token}\n`);
    const occurrences = getScreenBuffer().split('\n').filter(l => l === token).length;
    expect(occurrences).toBe(1);
  });

  it('is idempotent: installing twice does not double-record', () => {
    installScreenBuffer();
    installScreenBuffer();
    const token = `sb-idem-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`${token}\n`);
    const occurrences = getScreenBuffer().split('\n').filter(l => l === token).length;
    expect(occurrences).toBe(1);
  });
});
