import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { installScreenBuffer, getScreenBufferDisplayLinesForOverlay, startOverlayEpoch } from '../../src/util/screen-buffer.js';

// The buffer hooks process.stdout.write once per module instance. vitest isolates
// modules per test file, so this file owns its own buffer instance. We write
// unique tokens and assert on those rather than the whole buffer, since other
// stdout traffic in this process may also land in the buffer.
describe('screen buffer', () => {
  // Stub the underlying write before the buffer installs over it, so the test
  // tokens we emit are still recorded by the buffer but never reach the terminal.
  let writeSpy: MockInstance;
  beforeAll(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterAll(() => {
    writeSpy.mockRestore();
  });

  it('is idempotent: installing twice does not double-record', () => {
    installScreenBuffer();
    installScreenBuffer();
    startOverlayEpoch();
    const token = `sb-idem-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`${token}\n`);
    const occurrences = getScreenBufferDisplayLinesForOverlay(19, 19).filter(l => l === token).length;
    expect(occurrences).toBe(1);
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

  describe('full-screen erase resets the overlay model', () => {
    // Regression: a banner reprinted mid-session (via /clear, /model, /config,
    // /eval or resize) is a full-screen erase followed by console.log(banner).
    // Its lines must not leak into overlay repaints — otherwise shrinking the
    // slash-command suggestion list repaints revealed rows with the banner.
    it('drops buffered lines so a redrawn banner never leaks into overlay repaints', () => {
      installScreenBuffer();
      startOverlayEpoch();
      // Pre-existing transcript, then a full-screen erase + banner reprint
      // (mirrors redrawBanner: clearEntireTerminal then console.log(banner)).
      process.stdout.write('old-transcript-line\n');
      process.stdout.write('\x1b[0m\x1b[r\x1b[H\x1b[2J\x1b[3J\x1b[H');
      process.stdout.write('BANNER_A\nBANNER_B\nBANNER_C\n');
      startOverlayEpoch(); // banner functions re-mark the epoch after drawing
      const lines = getScreenBufferDisplayLinesForOverlay(6, 19);
      expect(lines.join('|')).not.toContain('BANNER_');
      expect(lines.join('|')).not.toContain('old-transcript-line');
      expect(lines.every(l => l === '')).toBe(true);
    });

    it('keeps post-erase transcript available for overlay repaints', () => {
      installScreenBuffer();
      startOverlayEpoch();
      process.stdout.write('\x1b[2J');
      process.stdout.write('BANNER_ONLY\n');
      startOverlayEpoch();
      const tag = `sb-post-erase-${Math.random().toString(36).slice(2)}`;
      process.stdout.write(`${tag}-1\n`);
      const lines = getScreenBufferDisplayLinesForOverlay(3, 19);
      // Real transcript printed after the banner is restorable; banner is not.
      expect(lines.join('|')).toContain(`${tag}-1`);
      expect(lines.join('|')).not.toContain('BANNER_ONLY');
    });
  });

  it('does not record cursor-addressed UI writes as transcript display lines', () => {
    installScreenBuffer();
    startOverlayEpoch();
    const token = `sb-ui-${Math.random().toString(36).slice(2)}`;
    process.stdout.write(`${token}-before\n`);
    process.stdout.write(`\x1b[10;1H\x1b[2K${token}-overlay\n`);

    const lines = getScreenBufferDisplayLinesForOverlay(19, 19).join('|');
    expect(lines).toContain(`${token}-before`);
    expect(lines).not.toContain(`${token}-overlay`);
  });
});
