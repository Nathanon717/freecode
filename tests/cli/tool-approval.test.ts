import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';
import {
  askQuestion,
  askContinueAfterLimit,
  confirmToolCallInteractive,
  parseScriptedToolChoice,
  formatScriptedToolMenu,
} from '../../src/cli/tool-approval.js';
import { UserAbortError } from '../../src/util/errors.js';
import type { ToolCallConfirmation } from '../../src/agent/tools/index.js';
import {
  type FakeStdin,
  box,
  flush,
  installProcessStreams,
  type ProcessStreamFixture,
} from './raw-session-harness.js';

// Raw-session tests fail by timing out; cap them low so a wedged session fails
// fast instead of after the 15s global default.
vi.setConfig({ testTimeout: 2000 });

vi.mock('../../src/cli/terminal-ui.js', () => ({
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
} from '../../src/cli/terminal-ui.js';

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

  beforeEach(() => {
    streams = installProcessStreams({ tty: false });
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
    vi.mocked(teardownBottomUI).mockClear();
    vi.mocked(setupInputUI).mockClear();
  });

  afterEach(() => {
    streams.restore();
    writeSpy.mockRestore();
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
  });

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

  it('returns { approved: false, message } for "deny" then message', async () => {
    const result = await confirmToolCallInteractive(makeRl(['deny', 'do it differently']), preview);
    expect(result).toEqual({ approved: false, message: 'do it differently' });
  });

  it.each([['n'], ['no'], ['d']])('returns approved:false for alias "%s"', async (answer) => {
    const result = await confirmToolCallInteractive(makeRl([answer, 'some message']), preview);
    expect(result).toEqual({ approved: false, message: 'some message' });
  });

  it('trims whitespace from the denial message', async () => {
    const result = await confirmToolCallInteractive(makeRl(['deny', '  trimmed  ']), preview);
    expect(result).toEqual({ approved: false, message: 'trimmed' });
  });

  it('calls teardownBottomUI', async () => {
    await confirmToolCallInteractive(makeRl(['approve']), preview);
    expect(teardownBottomUI).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// confirmToolCallInteractive — TTY, non-absolute menu (isFooterUIActive=false)
// ---------------------------------------------------------------------------

describe('confirmToolCallInteractive (TTY, non-absolute menu)', () => {
  let stdin: FakeStdin;
  let streams: ProcessStreamFixture;
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, 'write'>>;

  beforeEach(() => {
    streams = installProcessStreams({ tty: true });
    stdin = streams.stdin;
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
    vi.mocked(setupInputUI).mockClear();
  });

  afterEach(() => {
    streams.restore();
    writeSpy.mockRestore();
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
  });

  it('returns approved:true on Enter (\\r) with default approve selection', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('returns approved:true on Enter (\\n)', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\n');
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('throws UserAbortError on Escape', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\x1b');
    await expect(promise).rejects.toThrow(UserAbortError);
  });

  it('"a" keeps approve selected, Enter confirms', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'a');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('"A" uppercase also keeps approve selected', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'A');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('"k" moves selection to approve', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'j');   // move to deny first
    stdin.emit('data', 'k');   // move back to approve
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('up arrow (\\x1b[A) moves selection to approve', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\x1b[B');  // down → deny
    stdin.emit('data', '\x1b[A');  // up → approve
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('"j" moves to deny, Enter opens message prompt', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'j');
    stdin.emit('data', '\r');
    await flush();
    stdin.emit('data', 'a');
    stdin.emit('data', 'b');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'ab' });
  });

  it('"d" moves to deny', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'd');
    stdin.emit('data', '\r');
    await flush();
    stdin.emit('data', 'x');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'x' });
  });

  it('"D" uppercase moves to deny', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'D');
    stdin.emit('data', '\r');
    await flush();
    stdin.emit('data', 'm');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'm' });
  });

  it('down arrow (\\x1b[B) moves to deny', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\x1b[B');
    stdin.emit('data', '\r');
    await flush();
    stdin.emit('data', 'z');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'z' });
  });

  it('calls process.exit on Ctrl-C in menu', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit-called');
    }));
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    expect(() => stdin.emit('data', '\x03')).toThrow('exit-called');
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    promise.catch(() => {});
  });

  it('writes to stdout during draw and redraw', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'j');  // redraw → deny
    stdin.emit('data', 'k');  // redraw → back to approve (stays resolvable)
    stdin.emit('data', '\r'); // confirm approve so the promise settles
    await promise;
    expect(writeSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// confirmToolCallInteractive — TTY, absolute menu (isFooterUIActive=true)
// ---------------------------------------------------------------------------

describe('confirmToolCallInteractive (TTY, absolute menu)', () => {
  let stdin: FakeStdin;
  let streams: ProcessStreamFixture;
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, 'write'>>;

  beforeEach(() => {
    streams = installProcessStreams({ tty: true });
    stdin = streams.stdin;
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(isFooterUIActive).mockReturnValue(true);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
    vi.mocked(setupInputUI).mockClear();
  });

  afterEach(() => {
    streams.restore();
    writeSpy.mockRestore();
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
  });

  it('returns approved:true using absolute positioned menu', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: true });
  });

  it('triggers absolute redraw on j/k selection changes', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', 'j');
    stdin.emit('data', 'k');
    stdin.emit('data', '\r');
    await promise;
    // absolute draw uses ANSI cursor positioning
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    expect(allOutput).toContain('\x1b[');
  });

  it('clears absolute rows in finally block', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    const allOutput = writeSpy.mock.calls.map(c => c[0]).join('');
    expect(allOutput).toContain('\x1b[2K');
  });

  it('calls setupInputUI in finally when isBottomUIActive=true and isTTY=true', async () => {
    vi.mocked(isBottomUIActive).mockReturnValue(true);
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\r');
    await promise;
    expect(setupInputUI).toHaveBeenCalled();
  });

  it('throws UserAbortError on Escape with absolute menu', async () => {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.emit('data', '\x1b');
    await expect(promise).rejects.toThrow(UserAbortError);
  });
});

// ---------------------------------------------------------------------------
// askQuestionOrEscape TTY paths — via deny→message flow
// ---------------------------------------------------------------------------

describe('askQuestionOrEscape (TTY, via deny flow)', () => {
  let stdin: FakeStdin;
  let streams: ProcessStreamFixture;
  let writeSpy: ReturnType<typeof vi.spyOn<typeof process.stdout, 'write'>>;

  beforeEach(() => {
    streams = installProcessStreams({ tty: true });
    stdin = streams.stdin;
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
  });

  afterEach(() => {
    streams.restore();
    writeSpy.mockRestore();
    vi.mocked(isFooterUIActive).mockReturnValue(false);
    vi.mocked(isBottomUIActive).mockReturnValue(false);
  });

  // Selects Deny and lands in message-entry mode. The returned confirm promise
  // is intentionally still pending (waiting for the denial message), so it is
  // boxed: returning it bare from an async fn would make `await enterDenyFlow()`
  // block on it forever. See box()/flush() in raw-session-harness.
  async function enterDenyFlow(): Promise<{ promise: Promise<ToolCallConfirmation> }> {
    const promise = confirmToolCallInteractive(ttyRl(), preview);
    stdin.type('j', '\r');
    await flush();  // let the menu session close and hand off to message-entry
    return box(promise);
  }

  it('submits accumulated buffer on \\r', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', 'h');
    stdin.emit('data', 'i');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'hi' });
  });

  it('submits buffer on \\n', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', 'o');
    stdin.emit('data', 'k');
    stdin.emit('data', '\n');
    await expect(promise).resolves.toEqual({ approved: false, message: 'ok' });
  });

  it('throws UserAbortError on Escape', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', '\x1b');
    await expect(promise).rejects.toThrow(UserAbortError);
  });

  it('ignores \\x1b[ escape sequences (arrow keys)', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', '\x1b[A');
    stdin.emit('data', 'z');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'z' });
  });

  it('ignores \\x1bO SS3 sequences', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', '\x1bOA');
    stdin.emit('data', 'q');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'q' });
  });

  it('handles \\x7f backspace (DEL)', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', 'a');
    stdin.emit('data', 'b');
    stdin.emit('data', '\x7f');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'a' });
  });

  it('handles \\x08 backspace (BS)', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', 'x');
    stdin.emit('data', '\x08');
    stdin.emit('data', 'y');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'y' });
  });

  it('backspace on empty buffer is a no-op', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', '\x7f');
    stdin.emit('data', 'q');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'q' });
  });

  it('filters out non-printable characters', async () => {
    const { promise } = await enterDenyFlow();
    stdin.emit('data', '\x01');
    stdin.emit('data', 'a');
    stdin.emit('data', '\r');
    await expect(promise).resolves.toEqual({ approved: false, message: 'a' });
  });

  it('calls process.exit on Ctrl-C during message entry', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit-called');
    }));
    const { promise } = await enterDenyFlow();
    expect(() => stdin.emit('data', '\x03')).toThrow('exit-called');
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    (promise as unknown as Promise<unknown>).catch(() => {});
  });
});
