import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createTuiLogSink } from '../../src/cli/tui-log-sink.js';
import {
  setupFooterUI,
  setupBottomUI,
  teardownFooterUI,
  suspendFooterTimer,
  resumeFooterTimer,
} from '../../src/cli/chrome/bottom-ui.js';
import { setInputBuffer } from '../../src/cli/chrome/input-buffer.js';
import { setTurnActive } from '../../src/cli/chrome/turn-state.js';

let stdoutWrites: string[];
let stderrWrites: string[];
let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;

beforeAll(() => {
  Object.defineProperty(process.stdout, 'rows', { value: 24, configurable: true, writable: true });
  Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true, writable: true });
});

beforeEach(() => {
  stdoutWrites = [];
  stderrWrites = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdoutWrites.push(String(chunk));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderrWrites.push(String(chunk));
    return true;
  });
  setInputBuffer('');
});

afterEach(() => {
  resumeFooterTimer();
  setTurnActive(false);
  teardownFooterUI();
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  vi.useRealTimers();
});

describe('createTuiLogSink', () => {
  it('writes to stderr untouched when no footer is up', () => {
    createTuiLogSink()('boom\n');
    expect(stderrWrites.join('')).toBe('boom\n');
    expect(stdoutWrites.join('')).toBe('');
  });

  it('routes through stdout and leaves stderr alone once the footer is up', () => {
    setupFooterUI();
    stdoutWrites.length = 0;
    createTuiLogSink()('boom\n');
    expect(stderrWrites).toHaveLength(0);
    expect(stdoutWrites.join('')).toContain('boom');
  });

  it('parks at the bottom of the scroll region before writing', () => {
    setupFooterUI();
    stdoutWrites.length = 0;
    createTuiLogSink()('boom\n');
    // rows 24, 2 reserved footer rows -> park on row 22, column 1.
    expect(stdoutWrites[0]).toBe('\x1b[22;1H');
  });

  it('repaints the chrome after the write so the input frame survives', () => {
    setupBottomUI();
    stdoutWrites.length = 0;
    createTuiLogSink()('boom\n');
    // Something is drawn after the log line itself, not just the park + text.
    expect(stdoutWrites.length).toBeGreaterThan(2);
  });

  it('converts bare newlines to CRLF so stack traces do not stair-step', () => {
    setupFooterUI();
    stdoutWrites.length = 0;
    createTuiLogSink()('line one\nline two\n');
    const logged = stdoutWrites.find((w) => w.includes('line one'))!;
    expect(logged).toBe('line one\r\nline two\r\n');
  });

  it('writes but does not repaint while the footer timer is suspended', () => {
    setupBottomUI();
    suspendFooterTimer();
    stdoutWrites.length = 0;
    createTuiLogSink()('boom\n');
    // A raw picker or the approval prompt owns those rows by hand; only the park and
    // the line itself may go out.
    // rows 24, 5 reserved once the input frame is up -> park on row 19.
    expect(stdoutWrites).toEqual(['\x1b[19;1H', 'boom\r\n']);
  });

  it('leaves the streaming cursor in the scroll region mid-turn', () => {
    setupBottomUI();
    setTurnActive(true);
    stdoutWrites.length = 0;
    createTuiLogSink()('boom\n');
    // Mid-turn the frame redraw saves and restores the cursor rather than parking it at
    // the caret, so the transcript resumes where the log line left off.
    const repaint = stdoutWrites[stdoutWrites.length - 1];
    expect(repaint.startsWith('\x1b[s')).toBe(true);
    expect(repaint.endsWith('\x1b[u')).toBe(true);
  });

  it('does not double up carriage returns already present', () => {
    setupFooterUI();
    stdoutWrites.length = 0;
    createTuiLogSink()('a\r\nb\r\n');
    const logged = stdoutWrites.find((w) => w.includes('a'))!;
    expect(logged).toBe('a\r\nb\r\n');
  });
});
