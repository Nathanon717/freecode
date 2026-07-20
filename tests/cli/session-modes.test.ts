import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import type { Interface } from 'readline';
import { createInteractiveMode } from '../../src/cli/session-modes.js';

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

// input-buffer is deliberately left real — key-handler tests verify real buffer state.
vi.mock('../../src/cli/chrome/bottom-ui.js', () => ({
  // Stub all IO / drawing side-effects.
  drawBottomUI: vi.fn(),
  drawFooter: vi.fn(),
  setupBottomUI: vi.fn(),
  teardownBottomUI: vi.fn(),
  teardownFooterUI: vi.fn(),
  setupInputUI: vi.fn(),
  resetSubmittedInputArea: vi.fn(),
  parkCursorAboveBottomUI: vi.fn(),
  parkCursorInScrollRegion: vi.fn(),
  setInlineCompletion: vi.fn(),
  setSuggestions: vi.fn(),
  isBottomUIActive: vi.fn(() => false),
  isFooterUIActive: vi.fn(() => false),
  getRows: vi.fn(() => 24),
  getLastReservedRows: vi.fn(() => 2),
}));

vi.mock('../../src/cli/chrome/footer-status.js', async (importOriginal) => ({
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  ...(await importOriginal<typeof import('../../src/cli/chrome/footer-status.js')>()),
  setActiveModel: vi.fn(),
  setActiveModelFromString: vi.fn(),
  setQuotaSnapshot: vi.fn(),
  setContextUsage: vi.fn(),
  setOpenAIDailySpend: vi.fn(),
}));

vi.mock('../../src/config/index.js', () => ({
  loadConfig: vi.fn(() => ({ toolConfirmation: 'auto' as const })),
  resolveModelSettings: vi.fn(() => ({ autoApproveTokenBudget: 0 })),
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

vi.mock('../../src/cli/eval/eval-menu.js', () => ({
  runEvalMenu: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/cli/menus/raw-picker.js', () => ({
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

vi.mock('../../src/cli/chrome/toggles.js', () => ({
  isReadOnly: vi.fn(() => false),
  getAskMode: vi.fn((): 'ask' | 'auto' => 'auto'),
  cycleByChar: vi.fn(() => false),
  initAskMode: vi.fn(),
}));

vi.mock('../../src/cli/tools/tool-approval.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const mod = await importOriginal<typeof import('../../src/cli/tools/tool-approval.js')>();
  return {
    // Real: used by scripted-mode tests.
    parseScriptedToolChoice: mod.parseScriptedToolChoice,
    formatScriptedToolMenu: mod.formatScriptedToolMenu,
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
  drawFooter,
  parkCursorAboveBottomUI,
  setupBottomUI,
  teardownBottomUI,
  teardownFooterUI,
} from '../../src/cli/chrome/bottom-ui.js';
import { getInputBuffer, setInputBuffer } from '../../src/cli/chrome/input-buffer.js';
import {
  setActiveModel,
  setActiveModelFromString,
  setQuotaSnapshot,
  setContextUsage,
} from '../../src/cli/chrome/footer-status.js';
import { loadCachedQuota, saveQuotaToCache } from '../../src/providers/quota/cache.js';
import { runConfigCommand } from '../../src/commands/config.js';
import { runModelCommand } from '../../src/commands/model.js';
import { runEvalMenu as evalMenuFn } from '../../src/cli/eval/eval-menu.js';
import { askQuestion, confirmToolCallInteractive } from '../../src/cli/tools/tool-approval.js';
import { isReadOnly, getAskMode, cycleByChar } from '../../src/cli/chrome/toggles.js';
import { getCommandCompletion, getFilteredCommands } from '../../src/cli/slash-commands.js';
import { runRawKeySession } from '../../src/cli/menus/raw-picker.js';
import { resolveModelSettings } from '../../src/config/index.js';
// Unmocked on purpose: the budget is compared against the very count this
// produces, so the boundary test must use the real thing.
import { countTextTokens } from '../../src/tokenizers/count.js';

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

function setTTY(value: boolean | undefined): void {
  Object.defineProperty(process.stdin, 'isTTY', { value, writable: true, configurable: true });
}

// ---------------------------------------------------------------------------
// createInteractiveMode — shape check (unchanged from original)
// ---------------------------------------------------------------------------

describe('createInteractiveMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a full session mode exposing the interactive capabilities', () => {
    const mode = createInteractiveMode(
      makeRl(),
      process.cwd(),
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
    const mode = createInteractiveMode(makeRl(), process.cwd(), getModel, setModel);
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
    vi.mocked(resolveModelSettings).mockReturnValue({ autoApproveTokenBudget: 0 } as never);
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
    setTTY(undefined); // some tests set it to true
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
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.mocked(isReadOnly).mockReturnValue(true);
        const { mode } = makeMode();
        const result = await mode.confirmToolCall({ name: toolName, args: {} });
        expect(result.approved).toBe(false);
        expect(result.message).toContain('Read-only');
        expect(confirmToolCallInteractive).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(`denied ${toolName}`));
        logSpy.mockRestore();
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

    // ---- auto-approve token budget ----
    // The budget is compared against the same count the approval hint displays,
    // so these tests run the real tokenizer rather than mocking the count.
    describe('auto-approve token budget', () => {
      const setBudget = (autoApproveTokenBudget: number): void => {
        vi.mocked(resolveModelSettings).mockReturnValue({ autoApproveTokenBudget } as never);
      };

      beforeEach(() => {
        vi.mocked(getAskMode).mockReturnValue('ask');
      });

      it.each(['read', 'grep', 'list_dir'])(
        'auto-approves %s when its result is under the budget',
        async (name) => {
          setBudget(100);
          const { mode } = makeMode();
          const result = await mode.confirmToolCall({ name, args: {}, resultText: 'tiny' });
          expect(result).toEqual({ approved: true });
          expect(confirmToolCallInteractive).not.toHaveBeenCalled();
        },
      );

      it('still prompts when the result is at or above the budget', async () => {
        setBudget(100);
        const { mode } = makeMode();
        await mode.confirmToolCall({ name: 'read', args: {}, resultText: 'word '.repeat(500) });
        expect(confirmToolCallInteractive).toHaveBeenCalledOnce();
      });

      // The threshold is strictly "less than", so the only discriminating cases
      // are budget === count (prompt) and budget === count + 1 (approve).
      it('is strictly less-than at the boundary', async () => {
        const resultText = 'some representative tool output';
        const { tokens } = countTextTokens(resultText, 'groq:boundary');

        setBudget(tokens);
        const atBudget = makeMode();
        await atBudget.mode.confirmToolCall({ name: 'read', args: {}, resultText });
        expect(confirmToolCallInteractive).toHaveBeenCalledOnce();

        vi.mocked(confirmToolCallInteractive).mockClear();
        setBudget(tokens + 1);
        const underBudget = makeMode();
        const result = await underBudget.mode.confirmToolCall({ name: 'read', args: {}, resultText });
        expect(result).toEqual({ approved: true });
        expect(confirmToolCallInteractive).not.toHaveBeenCalled();
      });

      it('is off at 0 — a zero-token result still prompts', async () => {
        setBudget(0);
        const { mode } = makeMode();
        await mode.confirmToolCall({ name: 'read', args: {}, resultText: '' });
        expect(confirmToolCallInteractive).toHaveBeenCalledOnce();
      });

      it('never auto-approves create, whatever the budget or size', async () => {
        setBudget(1000);
        const { mode } = makeMode();
        await mode.confirmToolCall({ name: 'create', args: {}, resultText: 'x' });
        expect(confirmToolCallInteractive).toHaveBeenCalledOnce();
      });

      it.each(['edit', 'shell_exec'])('never auto-approves %s', async (name) => {
        setBudget(1000);
        const { mode } = makeMode();
        await mode.confirmToolCall({ name, args: {}, resultText: 'x' });
        expect(confirmToolCallInteractive).toHaveBeenCalledOnce();
      });

      it('prompts when a budget-approvable tool reports no token count', async () => {
        setBudget(1000);
        const { mode } = makeMode();
        await mode.confirmToolCall({ name: 'read', args: {} });
        expect(confirmToolCallInteractive).toHaveBeenCalledOnce();
      });
    });

    it('auto-approves without any tool-call limit prompt', async () => {
      const { mode } = makeMode();
      for (let i = 0; i < 25; i++) {
        const result = await mode.confirmToolCall({ name: 'read', args: {} });
        expect(result.approved).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle callbacks — non-TTY
  // -------------------------------------------------------------------------

  describe('lifecycle (non-TTY)', () => {
    beforeEach(() => setTTY(false));

    // Every TTY-guarded hook must skip all bottom-UI drawing off a TTY.
    // (beforeScreenClear tears down unconditionally, so it is not listed here.)
    it.each(['beforeAgentCall', 'afterAgentCall', 'afterScreenClear', 'beforeDispatch', 'afterDispatch'] as const)(
      '%s draws no bottom UI when stdin is not a TTY',
      (hook) => {
        const { mode } = makeMode();
        void (mode[hook] as () => unknown)();
        expect(teardownBottomUI).not.toHaveBeenCalled();
        expect(setupBottomUI).not.toHaveBeenCalled();
        expect(drawBottomUI).not.toHaveBeenCalled();
      },
    );
  });

  // -------------------------------------------------------------------------
  // Lifecycle callbacks — TTY
  // -------------------------------------------------------------------------

  describe('lifecycle (TTY)', () => {
    beforeEach(() => setTTY(true));

    it.each([
      ['beforeAgentCall', [teardownBottomUI]],
      ['afterAgentCall', [setupBottomUI, drawBottomUI]],
      ['beforeScreenClear', [teardownBottomUI]],
      ['afterScreenClear', [setupBottomUI]],
      ['beforeDispatch', [teardownBottomUI, parkCursorAboveBottomUI]],
    ] as const)('%s drives the expected bottom-UI hooks (TTY)', (hook, expected) => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void (mode[hook] as () => unknown)();
      for (const fn of expected) expect(fn).toHaveBeenCalled();
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

    it('onAgentResult feeds the provider-reported prompt tokens to the ctx slot', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.onAgentResult!({
        providerId: 'groq',
        modelId: 'llama-3.3',
        quota: null,
        usage: { totalTokens: 4243, promptTokens: 4242, outputTokens: 1 },
      } as never);
      // Exactly the reported prompt tokens — no sum, no estimate. Window is null
      // (unknown model in test store), so the slot will render a bare count.
      expect(setContextUsage).toHaveBeenCalledWith({ tokens: 4242, window: null });
    });

    it('onAgentResult blanks the ctx slot for Anthropic (cache-excluded count reads low)', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.onAgentResult!({
        providerId: 'anthropic',
        modelId: 'claude-3',
        quota: null,
        usage: { totalTokens: 4243, promptTokens: 4242, outputTokens: 1 },
      } as never);
      // Even with a reported count, Anthropic is suppressed — input_tokens omits
      // cache_read/cache_creation, so the number would undercount. Blank, not wrong.
      expect(setContextUsage).toHaveBeenCalledWith(null);
    });

    it('onAgentResult leaves the ctx slot untouched when no token count was reported', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      void mode.onAgentResult!({
        providerId: 'groq',
        modelId: 'llama-3.3',
        quota: null,
        usage: { totalTokens: 0 },
      } as never);
      expect(setContextUsage).not.toHaveBeenCalled();
    });

    it('onStepUsage ticks the ctx slot up mid-turn, repainting on each step', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      // A multi-step tool turn resends a longer history each step, so the
      // reported prompt tokens climb. Each step lands in the footer as it
      // happens rather than only the last one at end of turn.
      mode.onStepUsage!({ providerId: 'groq', modelId: 'llama-3.3', promptTokens: 1200 });
      mode.onStepUsage!({ providerId: 'groq', modelId: 'llama-3.3', promptTokens: 3400 });
      expect(setContextUsage).toHaveBeenNthCalledWith(1, { tokens: 1200, window: null });
      expect(setContextUsage).toHaveBeenNthCalledWith(2, { tokens: 3400, window: null });
      // Repainted per step — the 1 s footer timer would miss any step that
      // completes inside that second, which is most of them.
      expect(drawFooter).toHaveBeenCalledTimes(2);
    });

    it('onStepUsage skips Anthropic rather than blanking on every step', () => {
      const { mode } = makeMode();
      vi.clearAllMocks();
      // The per-step count omits cache_read/cache_creation and would read far
      // low. Leave the slot to onAgentResult instead of clearing it repeatedly.
      mode.onStepUsage!({ providerId: 'anthropic', modelId: 'claude-3', promptTokens: 4242 });
      expect(setContextUsage).not.toHaveBeenCalled();
      expect(drawFooter).not.toHaveBeenCalled();
    });

    it('afterDispatch fires applyModelChange when the model has changed', () => {
      const m = freshModel();
      const getModel = vi.fn(() => m);
      const mode = createInteractiveMode(makeRl(), process.cwd(), getModel, vi.fn());
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
      setTTY(false);
      vi.mocked(askQuestion).mockResolvedValueOnce('user typed this');
      const { mode } = makeMode();
      const result = await mode.readInput();
      expect(result).toBe('user typed this');
      expect(askQuestion).toHaveBeenCalledOnce();
      expect(runRawKeySession).not.toHaveBeenCalled();
    });

    it('TTY path: calls runRawKeySession instead of askQuestion', async () => {
      setTTY(true);
      const { mode } = makeMode();
      // Kick off readInput (it awaits the raw session promise).
      const p = mode.readInput();
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
      const p = mode.readInput();
      return p;
    }

    // Set the buffer, fire keys through the captured handler, return the result.
    function pressKeys(initial: string, keys: string[]): string {
      void startReadInput(); // resets the buffer
      setInputBuffer(initial);
      for (const k of keys) capturedRawSession.onKey?.(k);
      const result = getInputBuffer();
      capturedRawSession.resolve?.('');
      return result;
    }

    beforeEach(() => {
      setTTY(true);
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

    it('\\r strips autofilled-but-untouched tool args before submitting', async () => {
      const p = startReadInput();
      setInputBuffer('read'); // cursor at end; '(' then expands the skeleton
      for (const k of ['(', 'x', '.', 't', 's']) capturedRawSession.onKey?.(k);
      capturedRawSession.onKey?.('\r');
      expect(await p).toBe('read(path="x.ts")');
    });

    it('\\r clears the buffer after submission', async () => {
      const p = startReadInput();
      setInputBuffer('bye');
      capturedRawSession.onKey?.('\r');
      await p;
      expect(getInputBuffer()).toBe('');
    });

    // --- Tab completion (needs an active completion) ---

    it('Tab applies the completion and updates the buffer', () => {
      vi.mocked(getCommandCompletion).mockReturnValue('/help');
      void startReadInput();
      setInputBuffer('/he');
      capturedRawSession.onKey?.('\t');
      expect(getInputBuffer()).toBe('/help');
      capturedRawSession.resolve?.('');
    });

    // --- Buffer edits. Cursor moves are probed behaviorally via a trailing
    // backspace/delete: the buffer position the edit lands on reveals the cursor. ---

    it.each([
      ['Ctrl+J inserts a newline', 'line1', ['\n'], 'line1\n'],
      ['Tab with no completion is a no-op', 'abc', ['\t'], 'abc'],
      ['Backspace removes the last char', 'hi', ['\x7f'], 'h'],
      ['Backspace on an empty buffer is a no-op', '', ['\x7f'], ''],
      ['Ctrl+H (\\x08) also backspaces', 'abc', ['\x08'], 'ab'],
      ['left arrow moves the cursor left', 'hello', ['\x1b[D', '\x7f'], 'helo'],
      ['alternate left arrow (\\x1bOD) moves the cursor left', 'hi', ['\x1bOD', '\x7f'], 'i'],
      ['right arrow moves the cursor right', 'hi', ['\x1b[H', '\x1b[C', '\x1b[3~'], 'h'],
      ['home moves the cursor to the start', 'abc', ['\x1b[H', '\x1b[3~'], 'bc'],
      ['end moves the cursor to the end', 'abc', ['\x1b[H', '\x1b[F', '\x7f'], 'ab'],
      ['up arrow moves to the previous line', 'hello\nworld', ['\x1b[A', '\x7f'], 'hell\nworld'],
      ['down arrow moves to the next line', 'hello\nworld', ['\x1b[A', '\x1b[B', '\x7f'], 'hello\nworl'],
      ['Delete (\\x1b[3~) removes the char at the cursor', 'abc', ['\x1b[H', '\x1b[3~'], 'bc'],
      ['Escape clears a non-empty buffer', 'something', ['\x1b'], ''],
      ['Escape on an empty buffer is a no-op', '', ['\x1b'], ''],
      ['printable characters are inserted', '', ['h', 'i', '!'], 'hi!'],
      ['non-printable control chars below 0x20 are filtered out', '', ['\x02'], ''],
      // Hand-typed tool calls: `(` after a tool name autofills the skeleton,
      // Tab cycles value slots, Backspace at an emptied slot steps back.
      ['( after a tool name autofills the argument skeleton', 'read', ['('], 'read(path="", offset=, limit=)'],
      ['Tab lands typing in the next value slot', 'read', ['(', '\t', '5'], 'read(path="", offset=5, limit=)'],
      ['Backspace at an emptied slot steps back instead of eating the skeleton', 'read', ['(', '\t', '5', '\t', '\x7f', '0'], 'read(path="", offset=50, limit=)'],
      ['Backspace at the first empty slot is blocked', 'read', ['(', '\x7f'], 'read(path="", offset=, limit=)'],
      ['( after a non-tool name inserts a lone bracket', 'notatool', ['('], 'notatool('],
    ] as const)('%s', (_label, initial, keys, expected) => {
      expect(pressKeys(initial, [...keys])).toBe(expected);
    });

    // --- Ctrl+letter toggles ---

    it('Ctrl+letter that matches a toggle cycles it', () => {
      vi.mocked(cycleByChar).mockReturnValueOnce(true);
      void startReadInput();
      capturedRawSession.onKey?.('\x01'); // Ctrl+A
      expect(cycleByChar).toHaveBeenCalledWith('A');
      expect(getInputBuffer()).toBe('');
      capturedRawSession.resolve?.('');
    });

    it('Ctrl+letter with no matching toggle leaves the buffer untouched', () => {
      vi.mocked(cycleByChar).mockReturnValue(false);
      void startReadInput();
      capturedRawSession.onKey?.('\x01'); // Ctrl+A, charCode 1 — not printable (< 0x20)
      expect(getInputBuffer()).toBe(''); // \x01 filtered out (not >= ' ')
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
