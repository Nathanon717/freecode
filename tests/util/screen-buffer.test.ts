import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installScreenBuffer, getScreenBuffer, getScreenBufferDisplayLines, getScreenBufferDisplayLinesForOverlay, startOverlayEpoch } from '../../src/util/screen-buffer.js';

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

  it('keeps display lines with intentional blanks for overlay repainting', () => {
    installScreenBuffer();
    const token = `sb-display-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`${token}-a\n\n${token}-b\n`);

    expect(getScreenBufferDisplayLines(3)).toEqual([`${token}-a`, '', `${token}-b`]);
  });

  describe('getScreenBufferDisplayLinesForOverlay', () => {
    // freecode parks the cursor at the bottom row of the scroll region before
    // printing output, so each newline scrolls content upward.  That means:
    //   - the bottom overlay row (row scrollHeight) is always blank
    //   - the preceding count-1 rows hold the last min(L, count-1) buffer lines
    //   - if L < count-1, the unwritten rows above the content are blank

    it('returns all blanks when no output has been written since setupInputUI', () => {
      installScreenBuffer();
      startOverlayEpoch(); // simulates setupInputUI clearing pre-startup banner lines
      const lines = getScreenBufferDisplayLinesForOverlay(10, 19);
      expect(lines).toHaveLength(10);
      expect(lines.every(l => l === '')).toBe(true);
    });

    it('places content above the always-blank bottom row and pads top with blanks', () => {
      // 5 lines printed from the bottom → rows 14-18 have content, row 19 blank,
      // rows 10-13 blank.  Overlay restore should be [blank×4, line1..5, ''].
      installScreenBuffer();
      startOverlayEpoch();
      const tag = `sb-overlay-partial-${Math.random().toString(36).slice(2)}`;
      process.stdout.write(`${tag}-1\n${tag}-2\n${tag}-3\n${tag}-4\n${tag}-5\n`);
      const lines = getScreenBufferDisplayLinesForOverlay(10, 19);
      expect(lines).toHaveLength(10);
      // Top 4 slots blank (rows 10-13 were above the content).
      expect(lines.slice(0, 4).every(l => l === '')).toBe(true);
      // Next 5 slots: lines 1-5 (in order).
      expect(lines[4]).toBe(`${tag}-1`);
      expect(lines[8]).toBe(`${tag}-5`);
      // Last slot: always blank (bottom row).
      expect(lines[9]).toBe('');
    });

    it('fills count-1 content rows and one blank when L >= count-1', () => {
      // 12 lines printed → overlay has 9 content rows + 1 blank bottom row.
      installScreenBuffer();
      startOverlayEpoch();
      const tag = `sb-overlay-full-${Math.random().toString(36).slice(2)}`;
      const written: string[] = [];
      for (let i = 1; i <= 12; i++) written.push(`${tag}-${i}`);
      process.stdout.write(written.join('\n') + '\n');
      const lines = getScreenBufferDisplayLinesForOverlay(10, 19);
      expect(lines).toHaveLength(10);
      // First 9 slots: last 9 lines of the buffer.
      expect(lines[0]).toBe(`${tag}-4`);
      expect(lines[8]).toBe(`${tag}-12`);
      // Last slot: blank.
      expect(lines[9]).toBe('');
    });
  });

  it('does not record cursor-addressed UI writes as transcript display lines', () => {
    installScreenBuffer();
    const token = `sb-ui-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`${token}-before\n`);
    process.stdout.write(`\x1b[10;1H\x1b[2K${token}-overlay\n`);

    expect(getScreenBuffer()).toContain(`${token}-before`);
    expect(getScreenBuffer()).not.toContain(`${token}-overlay`);
    expect(getScreenBufferDisplayLines(1)).toEqual([`${token}-before`]);
  });
});
