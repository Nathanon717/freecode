import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Interface } from 'readline';
import { createInteractiveMode, createScriptedMode } from '../../src/cli/session-modes.js';
import type { SessionController } from '../../src/agent/session-controller.js';

// ---------------------------------------------------------------------------
// Capture raw-key-session handlers so tests can fire key events directly.
// ---------------------------------------------------------------------------
const capturedRawSession = vi.hoisted(() => ({
  onKey: null as ((d: string) => void) | null,
  onCtrlC: null as (() => void) | null,
  onClose: null as (() => void) | null,
  resolve: null as ((v: string) => void) | null,
}));

// ---------------------------------------------------------------------------
// Mocks — order matters: hoisted vars must be declared before the mock that uses them.
// ---------------------------------------------------------------------------

vi.mock('../../src/cli/terminal-ui.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/cli/terminal-ui.js')>();
  return {
    // Keep real input-buffer functions — key-handler tests verify real buffer state.
    getInputBuffer: mod.getInputBuffer,
    setInputBuffer: mod.setInputBuffer,
    insertAtCursor: mod.insertAtCursor,
    backspaceAtCursor: mod.backspaceAtCursor,
    deleteAtCursor: mod.deleteAtCursor,
    moveCursorLeft: mod.moveCursorLeft,
    moveCursorRight: mod.moveCursorRight,
    moveCursorUp: mod.moveCursorUp,
    moveCursorDown: mod.moveCursorDown,
    moveCursorHome: mod.moveCursorHome,
    moveCursorEnd: mod.moveCursorEnd,
    // Stub all IO / drawing side-effects.
    drawBottomUI: vi.fn(),
    setupBottomUI: vi.fn(),
    teardownBottomUI: vi.fn(),
    teardownFooterUI: vi.fn(),
    setupInputUI: vi.fn(),
    resetSubmittedInputArea: vi.fn(),
    parkCursorAboveBottomUI: vi.fn(),
    parkCursorInScrollRegion: vi.fn(),
    setActiveModel: vi.fn(),
    setActiveModelFromString: vi.fn(),
    setQuotaSnapshot: vi.fn(),
    setOpenAIDailySpend: vi.fn(),
    setTokenCount: vi.fn(),
    setInlineCompletion: vi.fn(),
    setSuggestions: vi.fn(),
    isBottomUIActive: vi.fn(() => false),
    isFooterUIActive: vi.fn(() => false),
    getRows: vi.fn(() => 24),
    getLastReservedRows: vi.fn(() => 2),
  };
});

vi.mock('../../src/config/index.js', () => ({
  loadConfig: vi.fn(() => ({ toolConfirmation: 'auto' as const })),
}));

vi.mock('../../src/providers/openai-daily-spend.js', () => ({
  refreshOpenAIDailySpend: vi.fn(),
}));

vi.mock('../../src/providers/quota/cache.js', () => ({
  loadCachedQuota: vi.fn(() => null),
  saveQuotaToCache: vi.fn(),
}));

vi.mock('../../src/cli/slash-commands.js', () => ({
  getCommandCompletion: vi.fn(() => null),
  getFilteredCommands: vi.fn(() => [] as string[]),
}));

vi.mock('../../src/commands/config.js', () => ({
  runConfigCommand: vi.fn((_rl: unknown, _model: unknown, onRestore: () => void) => {
    onRestore?.();
    return Promise.resolve();
  }),
}));

vi.mock('../../src/commands/model.js', () => ({
  runModelCommand: vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_rl: unknown, _model: unknown, _set: unknown, onRestore: () => void): Promise<any> => {
      onRestore?.();
      return Promise.resolve(undefined);
    },
  ),
}));

vi.mock('../../src/cli/eval-menu.js', () => ({
  runEvalMenu: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/cli/raw-picker.js', () => ({
  runRawKeySession: vi.fn(
    (handlers: {
      onKey: (d: string) => void;
      onCtrlC: () => void;
      onClose: () => void;
    }) => {
      capturedRawSession.onKey = handlers.onKey;
      capturedRawSession.onCtrlC = handlers.onCtrlC;
      capturedRawSession.onClose = handlers.onClose;
      let resolveFn!: (v: string) => void;
      const promise = new Promise<string>((r) => { resolveFn = r; });
      capturedRawSession.resolve = resolveFn;
      return { promise, close: (v: string) => resolveFn(v) };
    },
  ),
}));

vi.mock('../../src/cli/toggles.js', () => ({
  isReadOnly: vi.fn(() => false),
  getAskMode: vi.fn((): 'ask' | 'auto' => 'auto'),
  cycleByChar: vi.fn(() => false),
  setCtrlHint: vi.fn(),
  initAskMode: vi.fn(),
}));

vi.mock('../../src/cli/tool-approval.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/cli/tool-approval.js')>();
  return {
    // Real: used by scripted-mode tests.
    parseScriptedToolChoice: mod.parseScriptedToolChoice,
    formatScriptedToolMenu: mod.formatScriptedToolMenu,
    // Spy wrapping real: scripted-mode limit tests exercise rl.question through this.
    askContinueAfterLimit: vi.fn((rl: Interface, count: number) =>
      mod.askContinueAfterLimit(rl, count),
    ),
    // Stub: non-TTY readInput path; tests set per-test values.
    askQuestion: vi.fn(() => Promise.resolve('mocked-answer')),
    // Stub: interactive confirmation; tests control approval decisions.
    confirmToolCallInteractive: vi.fn(() => Promise.resolve({ approved: true })),
  };
});

// ---------------------------------------------------------------------------
// Import mocked symbols for assertions.
// ---------------------------------------------------------------------------
import {
  drawBottomUI,
  getInputBuffer,
  parkCursorAboveBottomUI,
  setActiveModel,
  setActiveModelFromString,
  setInputBuffer,
  setQuotaSnapshot,
  setupBottomUI,
  teardownBottomUI,
  teardownFooterUI,
} from '../../src/cli/terminal-ui.js';
import { loadCachedQuota, saveQuotaToCache } from '../../src/providers/quota/cache.js';
import { runConfigCommand } from '../../src/commands/config.js';
import { runModelCommand } from '../../src/commands/model.js';
import { runEvalMenu as evalMenuFn } from '../../src/cli/eval-menu.js';
import { askQuestion, confirmToolCallInteractive, askContinueAfterLimit } from '../../src/cli/tool-approval.js';
import { isReadOnly, getAskMode, cycleByChar, setCtrlHint } from '../../src/cli/toggles.js';
import { getCommandCompletion, getFilteredCommands } from '../../src/cli/slash-commands.js';
import { runRawKeySession } from '../../src/cli/raw-picker.js';

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function makeRl(answer = ''): Interface {
  return {
    resume: vi.fn(),
    pause: vi.fn(),
    question: vi.fn((_prompt: string, cb: (a: string) => void) => cb(answer)),
  } as unknown as Interface;
}

function makeSession(): SessionController {
  return { getContextTokenCount: vi.fn(() => 0) } as unknown as SessionController;
}

// ---------------------------------------------------------------------------
// createScriptedMode
// ---------------------------------------------------------------------------

describe('createScriptedMode', () => {
  let dir: string;
  let logSpy: MockInstance;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'freecode-scripted-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
    delete process.env['FREECODE_AUTO_CONFIRM'];
    delete process.env['FREECODE_MAX_TOOL_CALLS'];
  });

  function writeScript(lines: string[]): string {
    const path = join(dir, 'script.txt');
    writeFileSync(path, lines.join('\n'), 'utf-8');
    return path;
  }

  it('reads non-empty lines in order then returns null when exhausted', async () => {
    const mode = createScriptedMode(writeScript(['hello', '', 'world']), dir, makeRl());
    expect(await mode.readInput(0)).toBe('hello');
    expect(await mode.readInput(0)).toBe('world');
    expect(await mode.readInput(0)).toBeNull();
  });

  it('decodes a JSON-encoded line as a single multiline message', async () => {
    const multiline = 'line one\nline two\nline three';
    const mode = createScriptedMode(writeScript([JSON.stringify(multiline)]), dir, makeRl());
    expect(await mode.readInput(0)).toBe(multiline);
    expect(await mode.readInput(0)).toBeNull();
  });

  it('approves a tool call when the next scripted line approves', async () => {
    const mode = createScriptedMode(writeScript(['approve']), dir, makeRl());
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('denies and forwards the feedback message when the script denies', async () => {
    const mode = createScriptedMode(writeScript(['deny', 'do it differently']), dir, makeRl());
    expect(await mode.confirmToolCall({ name: 'create', args: {} })).toEqual({
      approved: false,
      message: 'do it differently',
    });
  });

  it('defaults to denial when no scripted choice follows', async () => {
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    expect(await mode.confirmToolCall({ name: 'shell_exec', args: {} })).toEqual({ approved: false });
  });

  it.each([
    ['y', true],
    ['yes', true],
    ['a', true],
    ['n', false],
    ['no', false],
    ['d', false],
  ])('parses scripted choice alias %s', async (alias, approved) => {
    const mode = createScriptedMode(writeScript([alias]), dir, makeRl());
    const result = await mode.confirmToolCall({ name: 'grep', args: {} });
    expect(result.approved).toBe(approved);
  });

  it('auto-approves every call when FREECODE_AUTO_CONFIRM=1', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('stops auto-approving when the user declines at the tool-call limit', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    process.env['FREECODE_MAX_TOOL_CALLS'] = '2';
    const rl = makeRl('n'); // decline the "continue?" prompt
    const mode = createScriptedMode(writeScript([]), dir, rl);

    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
    const second = await mode.confirmToolCall({ name: 'read', args: {} });
    expect(second.approved).toBe(false);
    expect(second.message).toContain('limit of 2');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(rl.question).toHaveBeenCalled();
  });

  it('continues auto-approving when the user accepts at the tool-call limit', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    process.env['FREECODE_MAX_TOOL_CALLS'] = '2';
    const mode = createScriptedMode(writeScript([]), dir, makeRl('')); // empty answer = continue

    await mode.confirmToolCall({ name: 'read', args: {} });
    expect(await mode.confirmToolCall({ name: 'read', args: {} })).toEqual({ approved: true });
  });

  it('exposes current-only model listing and skips stray confirmations', () => {
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    expect(mode.modelListMode).toBe('current-only');
    expect(mode.skipStrayConfirmations).toBe(true);
  });

  it('runEvalMenu prints that /eval is not available in scripted mode', async () => {
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    await mode.runEvalMenu?.();
    expect(logSpy.mock.calls.flat().join(' ')).toContain('/eval is not available');
  });

  it('announces goodbye when input is exhausted', async () => {
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    await mode.onInputExhausted?.();
    expect(logSpy.mock.calls.flat().join(' ')).toContain('Goodbye');
  });

  it('skips the Goodbye message when FREECODE_AUTO_CONFIRM=1', async () => {
    process.env['FREECODE_AUTO_CONFIRM'] = '1';
    const mode = createScriptedMode(writeScript([]), dir, makeRl());
    await mode.onInputExhausted?.();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createInteractiveMode — shape check (unchanged from original)
// ---------------------------------------------------------------------------

describe('createInteractiveMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a full session mode exposing the interactive capabilities', () => {
    const session = { getContextTokenCount: () => 0, messages: [] };
    const mode = createInteractiveMode(
      makeRl(),
      process.cwd(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      session as any,
      () => 'groq:test-model',
      () => {},
    );

    expect(mode.modelListMode).toBe('full');
    for (const method of [
      'readInput',
      'confirmToolCall',
      'beforeAgentCall',
      'afterAgentCall',
      'runConfig',
      'runModelMenu',
      'runEvalMenu',
      'onExit',
    ] as const) {
      expect(typeof mode[method]).toBe('function');
    }
  });
});

// ---------------------------------------------------------------------------
// createInteractiveMode — detailed behaviour
// ---------------------------------------------------------------------------

describe('createInteractiveMode — detailed', () => {
  let modelIdx = 0;
  function freshModel() { return `groq:m${++modelIdx}`; }
  function makeMode(model?: string) {
    const m = model ?? freshModel();
    const getModel = vi.fn(() => m);
    const setModel = vi.fn();
    const mode = createInteractiveMode(makeRl(), process.cwd(), makeSession(), getModel, setModel);
    return { mode, getModel, setModel };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish defaults that clearAllMocks may have disrupted.
    vi.mocked(getAskMode).mockReturnValue('auto');
    vi.mocked(isReadOnly).mockReturnValue(false);
    vi.mocked(cycleByChar).mockReturnValue(false);
    vi.mocked(loadCachedQuota).mockReturnValue(null);
    vi.mocked(getCommandCompletion).mockReturnValue(null);
    vi.mocked(getFilteredCommands).mockReturnValue([]);
    vi.mocked(confirmToolCallInteractive).mockResolvedValue({ approved: true });
    vi.mocked(runConfigCommand).mockImplementation((_rl, _model, onRestore: () => void) => {
      onRestore?.();
      return Promise.resolve();
    });
    vi.mocked(runModelCommand).mockImplementation((_rl, _model, _set, onRestore: () => void) => {
      onRestore?.();
      return Promise.resolve() as never;
    });
    vi.mocked(evalMenuFn).mockResolvedValue();
    setInputBuffer('');
    capturedRawSession.onKey = null;
    capturedRawSession.onCtrlC = null;
    capturedRawSession.onClose = null;
    capturedRawSession.resolve = null;
  });

  afterEach(() => {
    // Reset isTTY (some tests set it to true).
    Object.defineProperty(process.stdin, 'isTTY', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  // -------------------------------------------------------------------------
  // applyModelStatus
  // -------------------------------------------------------------------------

  describe('applyModelStatus', () => {
    it('calls setActiveModelFromString on creation', () => {
      makeMode('groq:some-model');
      expect(vi.mocked(setActiveModelFromString)).toHaveBeenCalledWith('groq:some-model');
    });

    it('loads cached quota and sets it when the cache has an entry', () => {
      const fakeSnapshot = { reset: 9_999_999 };
      vi.mocked(loadCachedQuota).mockReturnValueOnce({ snapshot: fakeSnapshot } as never);
      makeMode('groq:cached-model');
      expect(vi.mocked(setQuotaSnapshot)).toHaveBeenCalledWith(fakeSnapshot);
    });

    it('skips setQuotaSnapshot when cache returns null', () => {
      vi.mocked(loadCachedQuota).mockReturnValue(null);
      makeMode('groq:no-cache');
      expect(vi.mocked(setQuotaSnapshot)).not.toHaveBeenCalled();
    });

    it('skips quota lookup entirely when model has no colon separator', () => {
      makeMode('localmodel'); // no ':' → idx === -1 → skip the if block
      expect(loadCachedQuota).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // confirmToolCall
  // -------------------------------------------------------------------------

  describe('confirmToolCall', () => {
    it('auto mode returns { approved: true } without calling confirmToolCallInteractive', async () => {
      vi.mocked(getAskMode).mockReturnValue('auto');
      const { mode } = makeMode();
      const result = await mode.confirmToolCall({ name: 'read', args: {} });
      expect(result).toEqual({ approved: true });
      expect(confirmToolCallInteractive).not.toHaveBeenCalled();
    });

    it('ask mode delegates to confirmToolCallInteractive', async () => {
      vi.mocked(getAskMode).mockReturnValue('ask');
      vi.mocked(confirmToolCallInteractive).mockResolvedValue({ approved: false, message: 'no' });
      const { mode } = makeMode();
      const result = await mode.confirmToolCall({ name: 'read', args: {} });
      expect(confirmToolCallInteractive).toHaveBeenCalledOnce();
      expect(result).toEqual({ approved: false, message: 'no' });
    });

    it.each(['create', 'edit', 'shell_exec'])(
      'read-only mode denies write tool %s',
      async (toolName) => {
        vi.mocked(isReadOnly).mockReturnValue(true);
        const { mode } = makeMode();
        const result = await mode.confirmToolCall({ name: toolName, args: {} });
        expect(result.approved).toBe(false);
        expect(result.message).toContain('Read-only');
        expect(confirmToolCallInteractive).not.toHaveBeenCalled();
      },
    );

    it.each(['read', 'grep', 'list_dir'])(
      'read-only mode allows read tool %s',
      async (toolName) => {
        vi.mocked(isReadOnly).mockReturnValue(true);
        vi.mocked(getAskMode).mockReturnValue('auto');
        const { mode } = makeMode();
        const result = await mode.confirmToolCall({ name: toolName, args: {} });
        expect(result.approved).toBe(true);
      },
    );

    it('calls askContinueAfterLimit on the 10th tool call', async () => {
      vi.mocked(askContinueAfterLimit).mockResolvedValueOnce(true);
      const { mode } = makeMode();
      for (let i = 0; i < 9; i++) {
        await mode.confirmToolCall({ name: 'read', args: {} });
      }
      await mode.confirmToolCall({ name: 'read', args: {} });
      expect(askContinueAfterLimit).toHaveBeenCalledOnce();
    });

    it('returns denied when the user declines at the tool-call limit', async () => {
      vi.mocked(askContinueAfterLimit).mockResolvedValueOnce(false);
      const { mode } = makeMode();
      for (let i = 0; i < 9; i++) {
        await mode.confirmToolCall({ name: 'read', args: {} });
      }
      const result = await mode.confirmToolCall({ name: 'read', args: {} });
      expect(result).toEqual({ approved: false, message: 'Stopped by user after tool call limit.' });
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle callbacks — non-TTY
  // -------------------------------------------------------------------------

  describe('lifecycle (non-TTY)', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    it('beforeAgentCall does not call teardownBottomUI when stdin is not a TTY', () => {
      const { mode } = makeMode();
      void mode.beforeAgentCall!();
      expect(teardownBottomUI).not.toHaveBeenCalled();
    });

    it('afterAgentCall is a no-op when stdin is not a TTY', () => {
      const { mode } = makeMode();
      void mode.afterAgentCall!();
      expect(setupBottomUI).not.toHaveBeenCalled();
      expect(drawBottomUI).not.toHaveBeenCalled();
    });

    it('afterScreenClear does not call setupBottomUI when stdin is not a TTY', () => {
      const { mode } = makeMode();
      void mode.afterScreenClear!();
      expect(setupBottomUI).not.toHaveBeenCalled();
    });

    it('beforeDispatch does not call teardownBottomUI when stdin is not a TTY', () => {
      const { mode } = makeMode();
      void mode.beforeDispatch!();
      expect(teardownBottomUI).not.toHaveBeenCalled();
    });

    it('afterDispatch does not call setupBottomUI when stdin is not a TTY', () => {
      const { mode } = makeMode();
      void mode.afterDispatch!();
      expect(setupBottomUI).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle callbacks — TTY
  // -------------------------------------------------------------------------

  describe('lifecycle (TTY)', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
    });

    it('beforeAgentCall tears down the bottom UI', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.beforeAgentCall!();
      expect(teardownBottomUI).toHaveBeenCalled();
    });

    it('afterAgentCall sets up and redraws the bottom UI', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.afterAgentCall!();
      expect(setupBottomUI).toHaveBeenCalled();
      expect(drawBottomUI).toHaveBeenCalled();
    });

    it('beforeScreenClear tears down the bottom UI', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.beforeScreenClear!();
      expect(teardownBottomUI).toHaveBeenCalled();
    });

    it('afterScreenClear sets up the bottom UI when TTY', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.afterScreenClear!();
      expect(setupBottomUI).toHaveBeenCalled();
    });

    it('onAgentResult sets the active model, quota snapshot, and saves to cache', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      const fakeQuota = { reset: 1_000_000 };
      void mode.onAgentResult!({ providerId: 'anthropic', modelId: 'claude-3', quota: fakeQuota } as never);
      expect(setActiveModel).toHaveBeenCalledWith('anthropic', 'claude-3');
      expect(setQuotaSnapshot).toHaveBeenCalledWith(fakeQuota);
      expect(saveQuotaToCache).toHaveBeenCalledWith('anthropic', fakeQuota);
    });

    it('onAgentResult skips saveQuotaToCache when quota is null', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.onAgentResult!({ providerId: 'anthropic', modelId: 'claude-3', quota: null } as never);
      expect(setActiveModel).toHaveBeenCalledWith('anthropic', 'claude-3');
      expect(saveQuotaToCache).not.toHaveBeenCalled();
    });

    it('beforeDispatch tears down the UI and parks cursor', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.beforeDispatch!();
      expect(teardownBottomUI).toHaveBeenCalled();
      expect(parkCursorAboveBottomUI).toHaveBeenCalled();
    });

    it('afterDispatch fires applyModelChange when the model has changed', () => {
      const m = freshModel();
      const getModel = vi.fn(() => m);
      const mode = createInteractiveMode(makeRl(), process.cwd(), makeSession(), getModel, vi.fn());
      // _lastAppliedModel is now m (set by applyModelStatus)
      vi.clearAllMocks();
      vi.mocked(getAskMode).mockReturnValue('auto');
      getModel.mockReturnValue(m + '-new');
      void mode.afterDispatch!();
      expect(setActiveModelFromString).toHaveBeenCalledWith(m + '-new');
      expect(setupBottomUI).toHaveBeenCalled();
      expect(drawBottomUI).toHaveBeenCalled();
    });

    it('afterDispatch is a no-op for applyModelChange when the model has not changed', () => {
      const m = freshModel();
      const { mode } = makeMode(m);
      vi.clearAllMocks();
      vi.mocked(getAskMode).mockReturnValue('auto');
      void mode.afterDispatch!(); // getSelectedModel() still returns m == _lastAppliedModel
      expect(setActiveModelFromString).not.toHaveBeenCalled();
    });

    it('runConfig calls runConfigCommand and triggers onRestore (redraws)', async () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      vi.mocked(runConfigCommand).mockImplementation((_rl, _model, onRestore: () => void) => {
        onRestore?.();
        return Promise.resolve();
      });
      await mode.runConfig!();
      expect(runConfigCommand).toHaveBeenCalledOnce();
      expect(drawBottomUI).toHaveBeenCalled();
    });

    it('runModelMenu calls runModelCommand and triggers onRestore (redraws)', async () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      vi.mocked(runModelCommand).mockImplementation((_rl, _model, _set, onRestore: () => void) => {
        onRestore?.();
        return Promise.resolve() as never;
      });
      await mode.runModelMenu!();
      expect(runModelCommand).toHaveBeenCalledOnce();
      expect(drawBottomUI).toHaveBeenCalled();
    });

    it('runEvalMenu delegates to the eval menu', async () => {
      const { mode, getModel } = makeMode();
      await mode.runEvalMenu();
      expect(evalMenuFn).toHaveBeenCalledWith(expect.anything(), expect.any(String), getModel);
    });

    it('onExit calls teardownFooterUI', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.onExit!();
      expect(teardownFooterUI).toHaveBeenCalled();
    });

    it('getReadOnly returns the current isReadOnly() value', () => {
      const { mode } = makeMode();
      vi.mocked(isReadOnly).mockReturnValue(false);
      expect(mode.getReadOnly!()).toBe(false);
      vi.mocked(isReadOnly).mockReturnValue(true);
      expect(mode.getReadOnly!()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // readInput
  // -------------------------------------------------------------------------

  describe('readInput', () => {
    it('non-TTY path: calls askQuestion and returns its result', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      vi.mocked(askQuestion).mockResolvedValueOnce('user typed this');
      const { mode } = makeMode();
      const result = await mode.readInput(0);
      expect(result).toBe('user typed this');
      expect(askQuestion).toHaveBeenCalledOnce();
      expect(runRawKeySession).not.toHaveBeenCalled();
    });

    it('TTY path: calls runRawKeySession instead of askQuestion', async () => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      const { mode } = makeMode();
      // Kick off readInput (it awaits the raw session promise).
      const p = mode.readInput(0);
      expect(runRawKeySession).toHaveBeenCalledOnce();
      expect(askQuestion).not.toHaveBeenCalled();
      capturedRawSession.resolve?.('done');
      await p;
    });
  });

  // -------------------------------------------------------------------------
  // Key handler tests (TTY)
  // -------------------------------------------------------------------------

  describe('key handlers (TTY)', () => {
    let stdoutSpy: MockInstance;
    let stdinPauseSpy: MockInstance;

    function startReadInput() {
      const { mode } = makeMode();
      const p = mode.readInput(0);
      return p;
    }

    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      stdinPauseSpy = vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin);
    });

    afterEach(() => {
      // Ensure any pending promise is resolved so tests don't leak.
      capturedRawSession.resolve?.('__cleanup__');
    });

    // --- Enter / submit ---

    it('\\r submits the current input buffer', async () => {
      const p = startReadInput();
      setInputBuffer('hello world'); // set AFTER startReadInput resets the buffer
      capturedRawSession.onKey?.('\r');
      expect(await p).toBe('hello world');
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('\\r submits the inline completion when one is active', async () => {
      vi.mocked(getCommandCompletion).mockReturnValue('/help');
      const p = startReadInput();
      setInputBuffer('/hel');
      capturedRawSession.onKey?.('\r');
      expect(await p).toBe('/help');
    });

    it('\\r clears the buffer after submission', async () => {
      const p = startReadInput();
      setInputBuffer('bye');
      capturedRawSession.onKey?.('\r');
      await p;
      expect(getInputBuffer()).toBe('');
    });

    // --- Ctrl+J: newline ---

    it('Ctrl+J (\\n) inserts a newline into the buffer', () => {
      void startReadInput();
      setInputBuffer('line1');
      capturedRawSession.onKey?.('\n');
      expect(getInputBuffer()).toBe('line1\n');
      capturedRawSession.resolve?.('');
    });

    // --- Tab completion ---

    it('Tab applies the completion and updates the buffer', () => {
      vi.mocked(getCommandCompletion).mockReturnValue('/help');
      void startReadInput();
      setInputBuffer('/he');
      capturedRawSession.onKey?.('\t');
      expect(getInputBuffer()).toBe('/help');
      capturedRawSession.resolve?.('');
    });

    it('Tab with no completion is a no-op', () => {
      void startReadInput();
      setInputBuffer('abc');
      capturedRawSession.onKey?.('\t');
      expect(getInputBuffer()).toBe('abc');
      capturedRawSession.resolve?.('');
    });

    // --- Backspace ---

    it('Backspace (\\x7f) removes the last character', () => {
      void startReadInput();
      setInputBuffer('hi');
      capturedRawSession.onKey?.('\x7f');
      expect(getInputBuffer()).toBe('h');
      capturedRawSession.resolve?.('');
    });

    it('Backspace on an empty buffer is a no-op', () => {
      void startReadInput();
      // buffer is already '' after startReadInput
      capturedRawSession.onKey?.('\x7f');
      expect(getInputBuffer()).toBe('');
      capturedRawSession.resolve?.('');
    });

    it('Ctrl+H (\\x08) also triggers backspace', () => {
      void startReadInput();
      setInputBuffer('abc');
      capturedRawSession.onKey?.('\x08');
      expect(getInputBuffer()).toBe('ab');
      capturedRawSession.resolve?.('');
    });

    // --- Cursor movement ---

    it('left arrow moves cursor left (behavioral: backspace deletes previous char)', () => {
      void startReadInput();
      setInputBuffer('hello'); // cursor at 5
      capturedRawSession.onKey?.('\x1b[D'); // left → cursor 4
      capturedRawSession.onKey?.('\x7f');   // backspace at 4 → removes 'l' at index 3
      expect(getInputBuffer()).toBe('helo');
      capturedRawSession.resolve?.('');
    });

    it('alternate left arrow (\\x1bOD) also moves cursor left', () => {
      void startReadInput();
      setInputBuffer('hi'); // cursor at 2
      capturedRawSession.onKey?.('\x1bOD'); // left → cursor 1
      capturedRawSession.onKey?.('\x7f');   // backspace → removes 'h'
      expect(getInputBuffer()).toBe('i');
      capturedRawSession.resolve?.('');
    });

    it('right arrow moves cursor right (behavioral: delete removes next char)', () => {
      void startReadInput();
      setInputBuffer('hi'); // cursor at 2
      capturedRawSession.onKey?.('\x1b[H'); // home → cursor 0
      capturedRawSession.onKey?.('\x1b[C'); // right → cursor 1
      capturedRawSession.onKey?.('\x1b[3~'); // delete at 1 → removes 'i'
      expect(getInputBuffer()).toBe('h');
      capturedRawSession.resolve?.('');
    });

    it('home key moves cursor to start of line (behavioral: delete removes first char)', () => {
      void startReadInput();
      setInputBuffer('abc');
      capturedRawSession.onKey?.('\x1b[H'); // home → cursor 0
      capturedRawSession.onKey?.('\x1b[3~'); // delete at 0 → removes 'a'
      expect(getInputBuffer()).toBe('bc');
      capturedRawSession.resolve?.('');
    });

    it('end key moves cursor to end of line (behavioral: backspace removes last char)', () => {
      void startReadInput();
      setInputBuffer('abc');
      capturedRawSession.onKey?.('\x1b[H'); // home → cursor 0
      capturedRawSession.onKey?.('\x1b[F'); // end → cursor 3
      capturedRawSession.onKey?.('\x7f');   // backspace at 3 → removes 'c'
      expect(getInputBuffer()).toBe('ab');
      capturedRawSession.resolve?.('');
    });

    it('up arrow on multiline buffer moves to previous line', () => {
      void startReadInput();
      setInputBuffer('hello\nworld'); // cursor at 11
      capturedRawSession.onKey?.('\x1b[A'); // up → cursor at col 5 of 'hello' = pos 5
      capturedRawSession.onKey?.('\x7f');   // backspace at 5 → removes 'o' from 'hello'
      expect(getInputBuffer()).toBe('hell\nworld');
      capturedRawSession.resolve?.('');
    });

    it('down arrow on multiline buffer moves to next line', () => {
      void startReadInput();
      setInputBuffer('hello\nworld'); // cursor at 11 (end)
      capturedRawSession.onKey?.('\x1b[A'); // up → end of 'hello' (pos 5)
      capturedRawSession.onKey?.('\x1b[B'); // down → end of 'world' (pos 11)
      capturedRawSession.onKey?.('\x7f');   // backspace at 11 → removes 'd'
      expect(getInputBuffer()).toBe('hello\nworl');
      capturedRawSession.resolve?.('');
    });

    it('Delete key (\\x1b[3~) removes the character at the cursor', () => {
      void startReadInput();
      setInputBuffer('abc'); // cursor at 3
      capturedRawSession.onKey?.('\x1b[H'); // home → cursor 0
      capturedRawSession.onKey?.('\x1b[3~'); // delete at 0 → removes 'a'
      expect(getInputBuffer()).toBe('bc');
      capturedRawSession.resolve?.('');
    });

    // --- Escape ---

    it('Escape clears the buffer when it has content', () => {
      void startReadInput();
      setInputBuffer('something');
      capturedRawSession.onKey?.('\x1b');
      expect(getInputBuffer()).toBe('');
      capturedRawSession.resolve?.('');
    });

    it('Escape on an empty buffer is a no-op', () => {
      void startReadInput();
      // buffer is already '' after startReadInput
      capturedRawSession.onKey?.('\x1b');
      expect(getInputBuffer()).toBe('');
      capturedRawSession.resolve?.('');
    });

    // --- Printable characters ---

    it('printable characters are inserted into the buffer', () => {
      void startReadInput();
      capturedRawSession.onKey?.('h');
      capturedRawSession.onKey?.('i');
      capturedRawSession.onKey?.('!');
      expect(getInputBuffer()).toBe('hi!');
      capturedRawSession.resolve?.('');
    });

    it('non-printable control chars below 0x20 are filtered out', () => {
      setInputBuffer('');
      void startReadInput();
      // \x02 is a control char that's not a toggle (charCode 2, letter 'B')
      // cycleByChar is mocked to return false → falls through to hint clear then printable filter
      capturedRawSession.onKey?.('\x02');
      expect(getInputBuffer()).toBe(''); // filtered: < 0x20
      capturedRawSession.resolve?.('');
    });

    // --- Ctrl+letter toggles ---

    it('Ctrl+letter that matches a toggle shows the ctrl hint', () => {
      vi.mocked(cycleByChar).mockReturnValueOnce(true);
      void startReadInput();
      capturedRawSession.onKey?.('\x01'); // Ctrl+A
      expect(setCtrlHint).toHaveBeenCalledWith(true);
      capturedRawSession.resolve?.('');
    });

    it('Ctrl+letter with no matching toggle does not show the hint', () => {
      vi.mocked(cycleByChar).mockReturnValue(false);
      void startReadInput();
      capturedRawSession.onKey?.('\x01'); // Ctrl+A, charCode 1 — not printable (< 0x20)
      expect(setCtrlHint).not.toHaveBeenCalledWith(true);
      expect(getInputBuffer()).toBe(''); // \x01 filtered out (not >= ' ')
      capturedRawSession.resolve?.('');
    });

    it('hint timer callback clears the hint after 5 seconds', () => {
      vi.useFakeTimers();
      vi.mocked(cycleByChar).mockReturnValueOnce(true);
      void startReadInput();
      capturedRawSession.onKey?.('\x01'); // Ctrl+A — sets timer
      expect(setCtrlHint).toHaveBeenCalledWith(true);
      vi.advanceTimersByTime(5000);       // fire the fallback timer
      expect(setCtrlHint).toHaveBeenCalledWith(false);
      vi.useRealTimers();
      capturedRawSession.resolve?.('');
    });

    it('pressing a second toggle key while hint is active replaces the existing timer', () => {
      vi.useFakeTimers();
      vi.mocked(cycleByChar).mockReturnValue(true);
      void startReadInput();
      capturedRawSession.onKey?.('\x01'); // Ctrl+A — sets timer
      capturedRawSession.onKey?.('\x01'); // Ctrl+A again — clears old timer, sets new one
      expect(setCtrlHint).toHaveBeenCalledTimes(2);
      vi.useRealTimers();
      capturedRawSession.resolve?.('');
    });

    it('\\r writes multi-line input with per-line prefixes to stdout', () => {
      void startReadInput();
      setInputBuffer('line1\nline2');
      capturedRawSession.onKey?.('\r');
      // stdout.write is called synchronously inside the handler
      const written = stdoutSpy.mock.calls.map(([s]: [unknown]) => String(s)).join('');
      expect(written).toContain('line1');
      expect(written).toContain('line2');
      // afterEach cleanup resolves the now-settled promise
    });

    // --- onCtrlC / onClose ---

    it('onCtrlC tears down footer and exits', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code) => undefined as never);
      void startReadInput();
      capturedRawSession.onCtrlC?.();
      expect(teardownFooterUI).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('onClose pauses stdin without throwing', () => {
      void startReadInput();
      expect(() => capturedRawSession.onClose?.()).not.toThrow();
      expect(stdinPauseSpy).toHaveBeenCalled();
      capturedRawSession.resolve?.('');
    });
  });
});
