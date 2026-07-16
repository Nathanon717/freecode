import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';
import {
  askQuestion,
  askContinueAfterLimit,
  confirmToolCallInteractive,
  getApprovalPreviewRowBudget,
  parseScriptedToolChoice,
  formatScriptedToolMenu,
} from '../../src/cli/tool-approval.js';
import { UserAbortError } from '../../src/util/errors.js';
import {
  type FakeStdin,
  flush,
  installProcessStreams,
  type ProcessStreamFixture,
} from './raw-session-harness.js';

// Raw-session tests fail by timing out; cap them low so a wedged session fails
// fast instead of after the 15s global default.
vi.setConfig({ testTimeout: 2000 });

vi.mock('../../src/cli/bottom-ui.js', () => ({
  isBottomUIActive: vi.fn(() => false),
  isFooterUIActive: vi.fn(() => false),
  teardownBottomUI: vi.fn(),
  setupBottomUI: vi.fn(),
  setupInputUI: vi.fn(),
  getRows: vi.fn(() => 24),
  getLastReservedRows: vi.fn(() => 2),
}));

import {
  isBottomUIActive,
  isFooterUIActive,
  teardownBottomUI,
  setupBottomUI,
  setupInputUI,
} from '../../src/cli/bottom-ui.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRl(answers: string[] = []): Interface {
  let idx = 0;
  return {
    question(_p: string, cb: (a: string) => void) { cb(answers[idx++] ?? ''); },
    resume() {},
    pause() {},
  } as unknown as Interface;
}

function ttyRl(): Interface {
  return { pause: vi.fn(), resume: vi.fn() } as unknown as Interface;
}

const preview = { name: 'read', args: { path: 'foo.ts' } };

// Installs process streams + a stdout spy and primes the bottom-ui flags.
function setupStreams(opts: { tty: boolean; footer: boolean }) {
  const streams = installProcessStreams({ tty: opts.tty });
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.mocked(isFooterUIActive).mockReturnValue(opts.footer);
  vi.mocked(isBottomUIActive).mockReturnValue(false);
  vi.mocked(teardownBottomUI).mockClear();
  vi.mocked(setupInputUI).mockClear();
  return { streams, stdin: streams.stdin, writeSpy };
}

function resetUIFlags(): void {
  vi.mocked(isFooterUIActive).mockReturnValue(false);
  vi.mocked(isBottomUIActive).mockReturnValue(false);
}

// ---------------------------------------------------------------------------
// askQuestion
// ---------------------------------------------------------------------------

describe('askQuestion', () => {
  it('resolves with the answer from readline', async () => {
    await expect(askQuestion(makeRl(['hello']), 'Q: ')).resolves.toBe('hello');
  });

  it('resolves with empty string when answer is empty', async () => {
    await expect(askQuestion(makeRl(['']), 'Q: ')).resolves.toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseScriptedToolChoice
// ---------------------------------------------------------------------------

describe('parseScriptedToolChoice', () => {
  it.each([
    ['y', 'approve'],
    ['yes', 'approve'],
    ['approve', 'approve'],
    ['a', 'approve'],
    ['Y', 'approve'],
    ['YES', 'approve'],
    ['  approve  ', 'approve'],
  ])('parses %s as approve', (input, expected) => {
    expect(parseScriptedToolChoice(input)).toBe(expected);
  });

  it.each([
    ['n', 'deny'],
    ['no', 'deny'],
    ['deny', 'deny'],
    ['d', 'deny'],
    ['N', 'deny'],
    ['NO', 'deny'],
    ['  deny  ', 'deny'],
  ])('parses %s as deny', (input, expected) => {
    expect(parseScriptedToolChoice(input)).toBe(expected);
  });

  it('returns null for empty string', () => {
    expect(parseScriptedToolChoice('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseScriptedToolChoice(undefined)).toBeNull();
  });

  it('returns null for unrecognised input', () => {
    expect(parseScriptedToolChoice('maybe')).toBeNull();
    expect(parseScriptedToolChoice('skip')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatScriptedToolMenu
// ---------------------------------------------------------------------------

describe('formatScriptedToolMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('highlights the approve option when choice is approve', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: string) => lines.push(s));
    formatScriptedToolMenu('approve');
    const combined = lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(combined).toContain('> Approve');
    expect(combined).toContain('Deny');
  });

  it('highlights the deny option when choice is deny', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: string) => lines.push(s));
    formatScriptedToolMenu('deny');
    const combined = lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
    expect(combined).toContain('Approve');
    expect(combined).toContain('> Deny');
  });
});

// ---------------------------------------------------------------------------
// askContinueAfterLimit
// ---------------------------------------------------------------------------

describe('askContinueAfterLimit', () => {
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, 'write'>>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(teardownBottomUI).mockClear();
    vi.mocked(setupBottomUI).mockClear();
    vi.mocked(isBottomUIActive).mockReturnValue(false);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('returns true when answer is "y"', async () => {
    await expect(askContinueAfterLimit(makeRl(['y']), 5)).resolves.toBe(true);
  });

  it('returns true for empty answer', async () => {
    await expect(askContinueAfterLimit(makeRl(['']), 5)).resolves.toBe(true);
  });

  it('returns false when answer is "n"', async () => {
    await expect(askContinueAfterLimit(makeRl(['n']), 3)).resolves.toBe(false);
  });

  it('calls teardownBottomUI', async () => {
    await askContinueAfterLimit(makeRl(['y']), 1);
    expect(teardownBottomUI).toHaveBeenCalled();
  });

  it('calls setupBottomUI in finally when isBottomUIActive=true and isTTY=true', async () => {
    vi.mocked(isBottomUIActive).mockReturnValue(true);
    const streams = installProcessStreams({ tty: true });
    try {
      await askContinueAfterLimit(makeRl(['y']), 1);
      expect(setupBottomUI).toHaveBeenCalled();
    } finally {
      streams.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// confirmToolCallInteractive — non-TTY paths
// ---------------------------------------------------------------------------

describe('confirmToolCallInteractive (non-TTY)', () => {
  let streams: ProcessStreamFixture;
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, 'write'>>;

  beforeEach(() => { ({ streams, writeSpy } = setupStreams({ tty: false, footer: false })); });
  afterEach(() => { streams.restore(); writeSpy.mockRestore(); resetUIFlags(); });

  it('returns { approved: true } for "approve"', async () => {
    const result = await confirmToolCallInteractive(makeRl(['approve']), preview);
    expect(result).toEqual({ approved: true });
  });

  it.each([['y'], ['yes'], ['a'], ['']])('returns approved:true for "%s"', async (answer) => {
    const result = await confirmToolCallInteractive(makeRl([answer]), preview);
    expect(result).toEqual({ approved: true });
  });

  it('reprompts on invalid input then resolves approve', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await confirmToolCallInteractive(makeRl(['maybe', 'approve']), preview);
    expect(result).toEqual({ approved: true });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('returns { approved: false } for "deny", with no follow-up prompt', async () => {
    const result = await confirmToolCallInteractive(makeRl(['deny']), preview);
    expect(result).toEqual({ approved: false });
  });

  it.each([['n'], ['no'], ['d']])('returns approved:false for alias "%s"', async (answer) => {
    const result = await confirmToolCallInteractive(makeRl([answer]), preview);
    expect(result).toEqual({ approved: false });
  });

  it('calls teardownBottomUI', async () => {
    await confirmToolCallInteractive(makeRl(['approve']), preview);
    expect(teardownBottomUI).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// confirmToolCallInteractive — TTY, inline hint (isFooterUIActive=false)
// ---------------------------------------------------------------------------

describe('confirmToolCallInteractive (TTY, inline hint)', () => {
  let stdin: FakeStdin;
  let streams: ProcessStreamFixture;
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, 'write'>>;

  beforeEach(() => { ({ stdin, streams, writeSpy } = setupStreams({ tty: true, footer: false })); });
  afterEach(() => { streams.restore(); writeSpy.mockRestore(); resetUIFlags(); });

  it.each([['\r'], ['\n']])('Enter (%j) confirms', async (key) => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', key);
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('draws the hint telling the user which keys act', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    expect(allOutput.replace(/\x1b\[[0-9;]*m/g, '')).toContain('Enter to confirm · Esc to deny');
  });

  it('unwinds the turn on Escape so the user lands back at the input bar', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\x1b');
    await expect(promise).rejects.toThrow(UserAbortError);
  });

  // The old menu bound these to selection movement; there is no selection now, so
  // they must not confirm, deny, or otherwise settle the prompt.
  it.each([['a'], ['d'], ['j'], ['k'], ['\x1b[A'], ['\x1b[B'], ['x']])(
    'ignores %j, leaving the prompt pending',
    async (key) => {
      const promise = confirmToolCallInteractive(ttyRl(), preview);
      let settled = false;
      void promise.then(() => { settled = true; }, () => { settled = true; });
      stdin.emit('data', key);
      await flush();
      expect(settled).toBe(false);
      stdin.emit('data', '\r'); // settle so the test doesn't leak a pending session
      await expect(promise).resolves.toEqual({ approved: true });
    },
  );

  it('calls process.exit on Ctrl-C at the prompt', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit-called');
    }));
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    expect(() => stdin.emit('data', '\x03')).toThrow('exit-called');
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    promise.catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// confirmToolCallInteractive — TTY, absolute hint (isFooterUIActive=true)
// ---------------------------------------------------------------------------

describe('confirmToolCallInteractive (TTY, absolute hint)', () => {
  let stdin: FakeStdin;
  let streams: ProcessStreamFixture;
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, 'write'>>;

  beforeEach(() => { ({ stdin, streams, writeSpy } = setupStreams({ tty: true, footer: true })); });
  afterEach(() => { streams.restore(); writeSpy.mockRestore(); resetUIFlags(); });

  it('returns approved:true using the absolute positioned hint', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: true });
    // absolute draw uses ANSI cursor positioning
    expect(writeSpy.mock.calls.map(c => c[0]).join('')).toContain('\x1b[');
  });

  it('clears the absolute hint row in the finally block', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    expect(allOutput).toContain('\x1b[2K');
  });

  it('pads clearance only when a preview was already flowed above', async () => {
    const withPreview = confirmToolCallInteractive(ttyRl(), { ...preview, previewedContent: true });
    stdin.emit('data', '\r');
    await withPreview;
    expect(writeSpy.mock.calls.map(c => c[0]).join('')).toContain('\n\n');

    writeSpy.mockClear();
    const withoutPreview = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await withoutPreview;
    expect(writeSpy.mock.calls.map(c => c[0]).join('')).not.toContain('\n\n');
  });

  it('calls setupInputUI in finally when isBottomUIActive=true and isTTY=true', async () => {
    vi.mocked(isBottomUIActive).mockReturnValue(true);
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    expect(setupInputUI).toHaveBeenCalled();
  });

  it('unwinds the turn on Escape with the absolute hint', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\x1b');
    await expect(promise).rejects.toThrow(UserAbortError);
  });
});

// ---------------------------------------------------------------------------
// getApprovalPreviewRowBudget
// ---------------------------------------------------------------------------

describe('getApprovalPreviewRowBudget', () => {
  afterEach(() => { resetUIFlags(); });

  it('returns null when no footer UI is active, leaving the preview unbounded', () => {
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    expect(getApprovalPreviewRowBudget({ header: 2, preamble: 0 })).toBeNull();
  });

  // rows 24 - reserved 2 = 22 rows of scroll region; the hint + its pad claim 3.
  it('leaves room for the header, the hint and its clearance pad', () => {
    vi.mocked(isFooterUIActive).mockReturnValue(true);
    expect(getApprovalPreviewRowBudget({ header: 3, preamble: 0 })).toBe(16);
  });

  it('yields further ground to keep the preamble on screen', () => {
    vi.mocked(isFooterUIActive).mockReturnValue(true);
    expect(getApprovalPreviewRowBudget({ header: 3, preamble: 5 })).toBe(11);
  });

  it('stops shrinking at a floor rather than starving the preview for a tall preamble', () => {
    vi.mocked(isFooterUIActive).mockReturnValue(true);
    expect(getApprovalPreviewRowBudget({ header: 3, preamble: 400 })).toBe(3);
  });

  it('sacrifices the floor before the header when the terminal is tiny', () => {
    vi.mocked(isFooterUIActive).mockReturnValue(true);
    // A header taller than the scroll region leaves nothing; never go below 1.
    expect(getApprovalPreviewRowBudget({ header: 40, preamble: 0 })).toBe(1);
    // Header fits with only 2 rows to spare: the preview gets those 2, not the floor of 3.
    expect(getApprovalPreviewRowBudget({ header: 17, preamble: 0 })).toBe(2);
  });
});
