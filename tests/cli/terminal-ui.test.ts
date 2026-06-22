import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  getInlineCompletionSuffix,
  isBottomUIActive,
  isFooterUIActive,
  suspendFooterTimer,
  resumeFooterTimer,
  getRows,
  getLastReservedRows,
  setSuggestions,
  setInlineCompletion,
  composeFooterOutput,
  drawFooter,
  drawBottomUI,
  setupFooterUI,
  setupInputUI,
  setupBottomUI,
  teardownBottomUI,
  teardownFooterUI,
  resetSubmittedInputArea,
  parkCursorInScrollRegion,
  parkCursorAboveBottomUI,
  setInputBuffer,
} from '../../src/cli/terminal-ui.js';

let writeSpy: MockInstance;

beforeAll(() => {
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  Object.defineProperty(process.stdout, 'rows', { value: 24, configurable: true, writable: true });
  Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true, writable: true });
});

beforeEach(() => {
  writeSpy.mockClear();
  setInputBuffer('');
});

afterEach(() => {
  vi.useRealTimers();
  teardownFooterUI();
  // Reset suggestion/completion state that teardown doesn't touch.
  setSuggestions([]);
  setInlineCompletion(null);
});

// ---------------------------------------------------------------------------
// getInlineCompletionSuffix
// ---------------------------------------------------------------------------

describe('getInlineCompletionSuffix', () => {
  it('returns the ghost suffix after the typed input', () => {
    expect(getInlineCompletionSuffix('/e', '/eval')).toBe('val');
    expect(getInlineCompletionSuffix('/eval', '/eval')).toBe('');
  });

  it('returns empty string when completion is null', () => {
    expect(getInlineCompletionSuffix('hello', null)).toBe('');
  });

  it('returns empty string when input does not prefix-match the completion', () => {
    expect(getInlineCompletionSuffix('/model', '/eval')).toBe('');
  });

  it('is case-insensitive when matching prefix', () => {
    expect(getInlineCompletionSuffix('/E', '/eval')).toBe('val');
    expect(getInlineCompletionSuffix('/EVAL', '/eval')).toBe('');
  });

  it('returns empty string when completion is shorter than input', () => {
    expect(getInlineCompletionSuffix('/evaluate', '/eval')).toBe('');
  });

  it('returns full completion when input is empty', () => {
    expect(getInlineCompletionSuffix('', '/eval')).toBe('/eval');
  });
});

// ---------------------------------------------------------------------------
// setSuggestions / setInlineCompletion
// ---------------------------------------------------------------------------

describe('setSuggestions / setInlineCompletion', () => {
  it('can be set without throwing', () => {
    expect(() => setSuggestions(['/eval', '/model'])).not.toThrow();
    expect(() => setInlineCompletion('/eval')).not.toThrow();
    expect(() => setInlineCompletion(null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getRows / getLastReservedRows
// ---------------------------------------------------------------------------

describe('getRows / getLastReservedRows', () => {
  it('getRows returns process.stdout.rows', () => {
    expect(getRows()).toBe(24);
  });

  it('getLastReservedRows defaults to 2 before any setup', () => {
    expect(getLastReservedRows()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// suspendFooterTimer / resumeFooterTimer
// ---------------------------------------------------------------------------

describe('suspendFooterTimer / resumeFooterTimer', () => {
  it('can be called without throwing regardless of footer state', () => {
    expect(() => suspendFooterTimer()).not.toThrow();
    expect(() => resumeFooterTimer()).not.toThrow();
    expect(() => suspendFooterTimer()).not.toThrow();
    expect(() => resumeFooterTimer()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isFooterUIActive / isBottomUIActive before setup
// ---------------------------------------------------------------------------

describe('state flags before setup', () => {
  it('footer is inactive before setupFooterUI', () => {
    expect(isFooterUIActive()).toBe(false);
  });

  it('input is inactive before setupInputUI', () => {
    expect(isBottomUIActive()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// composeFooterOutput
// ---------------------------------------------------------------------------

describe('composeFooterOutput', () => {
  it('returns empty string when footer is not active', () => {
    expect(composeFooterOutput()).toBe('');
  });

  it('returns a non-empty ANSI string when footer is active', () => {
    vi.useFakeTimers();
    setupFooterUI();
    const output = composeFooterOutput();
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain('\x1b[s'); // save cursor
    expect(output).toContain('\x1b[u'); // restore cursor
  });

  it('output contains cursor-move sequences targeting the last row', () => {
    vi.useFakeTimers();
    setupFooterUI();
    const output = composeFooterOutput();
    // Row 24 should appear in at least one cursor-move sequence.
    expect(output).toContain('24;');
  });
});

// ---------------------------------------------------------------------------
// setupFooterUI
// ---------------------------------------------------------------------------

describe('setupFooterUI', () => {
  it('activates footer and writes to stdout', () => {
    vi.useFakeTimers();
    expect(isFooterUIActive()).toBe(false);
    setupFooterUI();
    expect(isFooterUIActive()).toBe(true);
    expect(writeSpy).toHaveBeenCalled();
  });

  it('is idempotent — calling twice does not double-activate', () => {
    vi.useFakeTimers();
    setupFooterUI();
    const callsAfterFirst = writeSpy.mock.calls.length;
    setupFooterUI();
    expect(writeSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(isFooterUIActive()).toBe(true);
  });

  it('starts a 1-second refresh timer', () => {
    vi.useFakeTimers();
    setupFooterUI();
    writeSpy.mockClear();
    vi.advanceTimersByTime(1000);
    // Timer fires once; footer draw should have written to stdout.
    expect(writeSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// teardownFooterUI
// ---------------------------------------------------------------------------

describe('teardownFooterUI', () => {
  it('deactivates footer, clears timer, writes cleanup sequences to stdout', () => {
    vi.useFakeTimers();
    setupFooterUI();
    writeSpy.mockClear();
    teardownFooterUI();
    expect(isFooterUIActive()).toBe(false);
    // Should have written clear-line and reset-scroll-region sequences.
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    expect(written).toContain('\x1b[r'); // reset scroll region
  });

  it('does nothing if footer was not active', () => {
    expect(isFooterUIActive()).toBe(false);
    writeSpy.mockClear();
    teardownFooterUI();
    // Only teardownBottomUI is a no-op; footer teardown itself also no-ops.
    // Either way stdout should not receive footer-clear sequences.
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    expect(written).not.toContain('\x1b[r');
  });

  it('stops timer so it no longer fires', () => {
    vi.useFakeTimers();
    setupFooterUI();
    teardownFooterUI();
    writeSpy.mockClear();
    vi.advanceTimersByTime(5000);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setupInputUI / teardownBottomUI
// ---------------------------------------------------------------------------

describe('setupInputUI / teardownBottomUI', () => {
  it('activates input UI after footer is up', () => {
    vi.useFakeTimers();
    setupFooterUI();
    expect(isBottomUIActive()).toBe(false);
    setupInputUI();
    expect(isBottomUIActive()).toBe(true);
  });

  it('teardownBottomUI deactivates input but leaves footer active', () => {
    vi.useFakeTimers();
    setupFooterUI();
    setupInputUI();
    expect(isBottomUIActive()).toBe(true);
    teardownBottomUI();
    expect(isBottomUIActive()).toBe(false);
    expect(isFooterUIActive()).toBe(true);
  });

  it('teardownBottomUI is a no-op when input not active', () => {
    vi.useFakeTimers();
    setupFooterUI();
    expect(isBottomUIActive()).toBe(false);
    expect(() => teardownBottomUI()).not.toThrow();
    expect(isBottomUIActive()).toBe(false);
  });

  it('reserved rows grow after setupInputUI', () => {
    vi.useFakeTimers();
    setupFooterUI();
    const before = getLastReservedRows();
    setupInputUI();
    expect(getLastReservedRows()).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// setupBottomUI (convenience)
// ---------------------------------------------------------------------------

describe('setupBottomUI', () => {
  it('activates both footer and input in one call', () => {
    vi.useFakeTimers();
    setupBottomUI();
    expect(isFooterUIActive()).toBe(true);
    expect(isBottomUIActive()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// drawFooter
// ---------------------------------------------------------------------------

describe('drawFooter', () => {
  it('writes nothing when footer is not active', () => {
    drawFooter();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes ANSI sequences when footer is active', () => {
    vi.useFakeTimers();
    setupFooterUI();
    writeSpy.mockClear();
    drawFooter();
    expect(writeSpy).toHaveBeenCalled();
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    expect(written).toContain('\x1b[s');
    expect(written).toContain('\x1b[u');
  });
});

// ---------------------------------------------------------------------------
// drawBottomUI
// ---------------------------------------------------------------------------

describe('drawBottomUI', () => {
  it('writes nothing when both UI layers are inactive', () => {
    drawBottomUI();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes footer sequences when only footer is active', () => {
    vi.useFakeTimers();
    setupFooterUI();
    writeSpy.mockClear();
    drawBottomUI();
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    expect(written).toContain('\x1b[s');
  });
});

// ---------------------------------------------------------------------------
// parkCursorInScrollRegion / parkCursorAboveBottomUI
// ---------------------------------------------------------------------------

describe('park cursor helpers', () => {
  it('parkCursorInScrollRegion does nothing when footer is inactive', () => {
    parkCursorInScrollRegion();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('parkCursorInScrollRegion writes a cursor-move when footer is active', () => {
    vi.useFakeTimers();
    setupFooterUI();
    writeSpy.mockClear();
    parkCursorInScrollRegion();
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    // Should contain a CSI cursor-move sequence.
    expect(written).toMatch(/\x1b\[\d+;\d+H/);
  });

  it('parkCursorAboveBottomUI always writes a cursor-move', () => {
    vi.useFakeTimers();
    setupFooterUI();
    writeSpy.mockClear();
    parkCursorAboveBottomUI();
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    expect(written).toMatch(/\x1b\[\d+;\d+H/);
  });
});

// ---------------------------------------------------------------------------
// resetSubmittedInputArea
// ---------------------------------------------------------------------------

describe('resetSubmittedInputArea', () => {
  it('is a no-op when input UI is not active', () => {
    resetSubmittedInputArea();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('writes clear sequences when input UI is active', () => {
    vi.useFakeTimers();
    setupBottomUI();
    writeSpy.mockClear();
    resetSubmittedInputArea();
    expect(writeSpy).toHaveBeenCalled();
  });

  it('handles multi-line input buffer without throwing', () => {
    vi.useFakeTimers();
    setupBottomUI();
    setInputBuffer('line one\nline two\nline three');
    writeSpy.mockClear();
    expect(() => resetSubmittedInputArea()).not.toThrow();
    expect(writeSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scroll-region sequences in output
// ---------------------------------------------------------------------------

describe('scroll region sequences', () => {
  it('setupFooterUI writes a scroll-region sequence reserving footer rows', () => {
    vi.useFakeTimers();
    setupFooterUI();
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    // Scroll region top=1, bottom=22 (rows 24 - 2 footer rows).
    expect(written).toContain('\x1b[1;22r');
  });

  it('teardownFooterUI resets scroll region to full screen', () => {
    vi.useFakeTimers();
    setupFooterUI();
    writeSpy.mockClear();
    teardownFooterUI();
    const written = writeSpy.mock.calls.map(c => String(c[0])).join('');
    expect(written).toContain('\x1b[r');
  });
});

// ---------------------------------------------------------------------------
// Suggestion overlay state
// ---------------------------------------------------------------------------

describe('suggestion overlay', () => {
  it('setSuggestions with non-empty list is reflected in next drawBottomUI', () => {
    vi.useFakeTimers();
    setupBottomUI();
    setSuggestions(['/eval', '/model', '/config']);
    writeSpy.mockClear();
    expect(() => drawBottomUI()).not.toThrow();
    expect(writeSpy).toHaveBeenCalled();
  });
});
