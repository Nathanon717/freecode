import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';
import {
  askQuestion,
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
  setupInputUI: vi.fn(),
  drawFooter: vi.fn(),
  suspendFooterTimer: vi.fn(),
  resumeFooterTimer: vi.fn(),
  parkCursorInScrollRegion: vi.fn(),
  getRows: vi.fn(() => 24),
  getLastReservedRows: vi.fn(() => 2),
}));

import {
  isBottomUIActive,
  isFooterUIActive,
  teardownBottomUI,
  setupInputUI,
  drawFooter,
  suspendFooterTimer,
  resumeFooterTimer,
  parkCursorInScrollRegion,
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
  vi.mocked(drawFooter).mockClear();
  vi.mocked(suspendFooterTimer).mockClear();
  vi.mocked(resumeFooterTimer).mockClear();
  vi.mocked(parkCursorInScrollRegion).mockClear();
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

  // The token prefix is drawn on a deferred tick (the first count compiles the
  // tokenizer), so let that timer fire before settling the prompt.
  const flushTimer = () => new Promise((r) => setTimeout(r, 0));

  it('fills in the exact token count once the deferred count resolves', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview, () => ({ tokens: 512, exact: true }));
    await flushTimer();
    stdin.emit('data', '\r');
    await promise;
    const plain = writeSpy.mock.calls.map(c => c[0]).join('').replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('+512 tokens · Enter to confirm · Esc to deny');
    expect(plain).not.toContain('appx');
  });

  it('cancels the deferred count when the prompt settles first (type-ahead race)', async () => {
    // Emit Enter before flushing the timer: the key settles the prompt, then the
    // deferred repaint must NOT fire and leave a stale hint after the finally clear.
    const promise = confirmToolCallInteractive(ttyRl(), preview, () => ({ tokens: 999, exact: false }));
    stdin.emit('data', '\r');
    await promise;
    await flushTimer(); // a still-scheduled repaint would fire here
    const plain = writeSpy.mock.calls.map(c => c[0]).join('').replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).not.toContain('999');
    expect(plain).not.toContain('tokens');
  });

  it('labels the token count "appx" when the estimate is not exact', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview, () => ({ tokens: 300, exact: false }));
    await flushTimer();
    stdin.emit('data', '\r');
    await promise;
    const plain = writeSpy.mock.calls.map(c => c[0]).join('').replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('+300 tokens appx · Enter to confirm · Esc to deny');
  });

  it('draws the confirm controls immediately, before the token count resolves', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview, () => ({ tokens: 300, exact: false }));
    // No timer flush: the deferred count has not run yet, but the controls are up.
    const plain = writeSpy.mock.calls.map(c => c[0]).join('').replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('Enter to confirm · Esc to deny');
    expect(plain).not.toContain('tokens');
    stdin.emit('data', '\r');
    await promise;
    await flushTimer(); // drain the deferred paint so it can't leak into the next test
  });

  it('omits the token prefix entirely when no count thunk is provided', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    await flushTimer();
    stdin.emit('data', '\r');
    await promise;
    const plain = writeSpy.mock.calls.map(c => c[0]).join('').replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).not.toContain('tokens');
  });

  it('erases the hint line in place on confirm so it never persists in the transcript', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    // Carriage-return + clear-line wipes the hint where the cursor is parked.
    expect(allOutput).toContain('\r\x1b[2K');
    // A bare newline would instead scroll the hint down into the transcript.
    expect(allOutput).not.toContain('\n');
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

  it('freezes the footer timer while the prompt is up and repaints the footer on settle', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    // The scroll region is left pinned; the footer rows are blanked for the hint
    // and the frozen timer can't clobber it, then the footer is repainted.
    expect(suspendFooterTimer).toHaveBeenCalled();
    expect(resumeFooterTimer).toHaveBeenCalled();
    expect(drawFooter).toHaveBeenCalled();
  });

  it('draws the hint on the literal last terminal row and clears it on settle', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    // Hint drawn on row 24 (getRows), and cleared there in the finally.
    expect(allOutput).toContain(`\x1b[24;1H\x1b[2K`);
  });

  it('blanks the footer rows so a non-empty footer is hidden behind the hint', async () => {
    // getLastReservedRows()=2, so the footer occupies rows 23-24. Row 24 gets the
    // hint; row 23 must be cleared or a non-empty footer would still show through.
    // (The mock footer is empty, so this escape is the only evidence of blanking.)
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    expect(allOutput).toContain(`\x1b[23;1H\x1b[2K`);
  });

  it('writes no bare newline on confirm, so the hint is never scrolled into the transcript', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    expect(allOutput).not.toContain('\n');
  });

  it('parks the cursor back in the scroll region on settle when the input UI was not up', async () => {
    // Mid-agent-turn: input UI is down (isBottomUIActive=false), so after the
    // footer is rebuilt the cursor must be re-parked at the scroll region bottom
    // or continued transcript output lands off-region and is clobbered.
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    expect(parkCursorInScrollRegion).toHaveBeenCalled();
    expect(setupInputUI).not.toHaveBeenCalled();
  });

  it('restores the input UI (not a bare scroll-region park) when it was up', async () => {
    vi.mocked(isBottomUIActive).mockReturnValue(true);
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    expect(setupInputUI).toHaveBeenCalled();
    expect(parkCursorInScrollRegion).not.toHaveBeenCalled();
  });

  it('unwinds the turn on Escape with the absolute hint', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\x1b');
    await expect(promise).rejects.toThrow(UserAbortError);
  });

  it('includes the token count in the absolute (footer) hint too', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview, () => ({ tokens: 42, exact: true }));
    await new Promise((r) => setTimeout(r, 0));
    stdin.emit('data', '\r');
    await promise;
    const plain = writeSpy.mock.calls.map(c => c[0]).join('').replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('+42 tokens · Enter to confirm · Esc to deny');
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
