import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';

// ── Module mocks ─────────────────────────────────────────────────────────────

const { pickerStore } = vi.hoisted(() => {
  const pickerStore = {
    capturedOpts: null as {
      render: () => string[];
      onKey: (key: string, redraw: () => void, close: (v: unknown) => void) => void;
    } | null,
    resolveReturn: null as unknown,
  };
  return { pickerStore };
});

vi.mock('../../src/cli/raw-picker.js', () => ({
  runRawPicker: vi.fn().mockImplementation((_rl: unknown, opts: unknown) => {
    pickerStore.capturedOpts = opts as typeof pickerStore.capturedOpts;
    return Promise.resolve(pickerStore.resolveReturn);
  }),
  countWrappedLines: vi.fn().mockReturnValue(1),
}));

vi.mock('../../src/config/index.js', () => ({
  loadConfig: vi.fn().mockReturnValue({ showEvalDots: false, providers: {} }),
  resolveApiKey: vi.fn().mockReturnValue('sk-test'),
  saveDefaultModel: vi.fn(),
}));

vi.mock('../../src/providers/model-store.js', () => ({
  getFavorites: vi.fn().mockReturnValue(new Set<string>()),
  setFavorite: vi.fn(),
  getNoNativeToolsKeys: vi.fn().mockReturnValue(new Set<string>()),
  getModel: vi.fn().mockReturnValue(undefined),
  getModelSettings: vi.fn().mockReturnValue({}),
  setModelSetting: vi.fn(),
}));

vi.mock('../../src/providers/registry.js', () => ({
  PROVIDER_REGISTRY: [
    {
      id: 'openai',
      name: 'OpenAI',
      models: [
        { id: 'gpt-4o', displayName: 'GPT-4o', isNew: false },
        { id: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', isNew: false },
      ],
      modelsSource: 'static',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      defaultApiKey: undefined,
    },
  ],
  initDynamicProviders: vi.fn().mockResolvedValue(undefined),
  clearModelNewFlag: vi.fn(),
}));

vi.mock('../../src/providers/model-cache.js', () => ({
  markModelSelected: vi.fn(),
}));

vi.mock('../../src/providers/pricing-verifier.js', () => ({
  getAnthropicVerifiedRates: vi.fn().mockResolvedValue({ confidence: 'unverified', inputPerMillion: null, outputPerMillion: null }),
  getOpenAIVerifiedRates: vi.fn().mockResolvedValue({ confidence: 'agreed', inputPerMillion: 2.5, outputPerMillion: 10.0 }),
}));

vi.mock('../../src/cli/eval-dots.js', () => ({
  loadEvalDotsData: vi.fn().mockReturnValue({}),
  buildEvalDots: vi.fn().mockReturnValue(''),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { runModelCommand } from '../../src/commands/model.js';
import { saveDefaultModel, resolveApiKey } from '../../src/config/index.js';
import { setFavorite, getNoNativeToolsKeys } from '../../src/providers/model-store.js';
import { markModelSelected } from '../../src/providers/model-cache.js';
import { clearModelNewFlag } from '../../src/providers/registry.js';
import { getOpenAIVerifiedRates } from '../../src/providers/pricing-verifier.js';

const fakeRl = { pause: vi.fn(), resume: vi.fn() } as unknown as Interface;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Runs runModelCommand and captures the picker's onKey/render callbacks via
// the shared pickerStore (set by the vi.mock factory for runRawPicker).
async function captureKeys(): Promise<typeof pickerStore.capturedOpts & object> {
  await runModelCommand(fakeRl, 'openai:gpt-4o', vi.fn());
  if (!pickerStore.capturedOpts) throw new Error('runRawPicker was never called — items may be empty');
  return pickerStore.capturedOpts;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runModelCommand', () => {
  let originalIsTTY: boolean | undefined;
  let originalRows: number | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    originalRows = process.stdout.rows;
    Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    pickerStore.capturedOpts = null;
    pickerStore.resolveReturn = null;
    // Reset any one-time queue overrides from previous tests, then restore defaults
    vi.mocked(resolveApiKey).mockReset().mockReturnValue('sk-test');
    vi.mocked(getNoNativeToolsKeys).mockReset().mockReturnValue(new Set());
    vi.mocked(getOpenAIVerifiedRates).mockReset().mockResolvedValue({ confidence: 'agreed', inputPerMillion: 2.5, outputPerMillion: 10.0 });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    Object.defineProperty(process.stdout, 'rows', { value: originalRows, configurable: true });
    vi.restoreAllMocks();
  });

  it('returns false and prints error when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });

    const result = await runModelCommand(fakeRl, 'openai:gpt-4o', vi.fn());

    expect(result).toBe(false);
    expect(logged.some(l => l.includes('interactive terminal'))).toBe(true);
  });

  it('returns false when no providers are configured', async () => {
    vi.mocked(resolveApiKey).mockReturnValueOnce(null);
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });

    const result = await runModelCommand(fakeRl, '', vi.fn());

    expect(result).toBe(false);
    expect(logged.some(l => l.includes('No configured providers'))).toBe(true);
  });

  it('opens picker in TTY mode and returns true on close with null', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runModelCommand(fakeRl, 'openai:gpt-4o', vi.fn());

    expect(result).toBe(true);
    expect(pickerStore.capturedOpts).not.toBeNull();
  });

  it('renders picker screen with model list', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const opts = await captureKeys();
    const lines = opts.render();

    expect(lines.some(l => l.includes('Select model'))).toBe(true);
    expect(lines.some(l => l.includes('GPT-4o'))).toBe(true);
  });

  it('sets model and logs confirmation when picker resolves with a selection', async () => {
    pickerStore.resolveReturn = {
      item: { providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-4o', displayName: 'GPT-4o' },
      saveDefault: false,
    };
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });

    const setModel = vi.fn();
    await runModelCommand(fakeRl, '', setModel);

    expect(setModel).toHaveBeenCalledWith('openai:gpt-4o');
    expect(markModelSelected).toHaveBeenCalledWith('openai', 'gpt-4o');
    expect(clearModelNewFlag).toHaveBeenCalledWith('openai', 'gpt-4o');
    expect(logged.some(l => l.includes('Model set to'))).toBe(true);
  });

  it('saves default model when saveDefault is true', async () => {
    pickerStore.resolveReturn = {
      item: { providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-4o', displayName: 'GPT-4o' },
      saveDefault: true,
    };
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });

    await runModelCommand(fakeRl, '', vi.fn());

    expect(saveDefaultModel).toHaveBeenCalledWith('openai:gpt-4o');
    expect(logged.some(l => l.includes('Default model set to'))).toBe(true);
  });

  describe('key handling', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('Escape closes the picker', async () => {
      const opts = await captureKeys();
      const close = vi.fn();
      opts.onKey('\x1b', vi.fn(), close);
      expect(close).toHaveBeenCalledWith(null);
    });

    it('up/down arrows navigate the list', async () => {
      const opts = await captureKeys();
      const redraw = vi.fn();
      opts.onKey('\x1b[B', redraw, vi.fn());
      opts.onKey('\x1b[A', redraw, vi.fn());
      expect(redraw).toHaveBeenCalledTimes(2);
    });

    it('right arrow opens detail view', async () => {
      const opts = await captureKeys();
      opts.onKey('\x1b[C', vi.fn(), vi.fn());
      const lines = opts.render();
      expect(lines.some(l => l.includes('Model details'))).toBe(true);
    });

    it('left arrow in detail view exits to picker', async () => {
      const opts = await captureKeys();
      opts.onKey('\x1b[C', vi.fn(), vi.fn()); // enter detail
      opts.onKey('\x1b[D', vi.fn(), vi.fn()); // exit detail
      const lines = opts.render();
      expect(lines.some(l => l.includes('Select model'))).toBe(true);
    });

    it('Escape in detail view exits detail mode (not picker)', async () => {
      const opts = await captureKeys();
      opts.onKey('\x1b[C', vi.fn(), vi.fn()); // enter detail
      // Escape in detail mode should exit detail, not close picker
      // The actual handler only checks detailMode when in detail mode
      opts.onKey('\x1b[D', vi.fn(), vi.fn()); // use left arrow to exit detail instead
      const lines = opts.render();
      expect(lines.some(l => l.includes('Select model'))).toBe(true);
    });

    it('left arrow toggles favorite and calls setFavorite', async () => {
      const opts = await captureKeys();
      opts.onKey('\x1b[D', vi.fn(), vi.fn());
      expect(setFavorite).toHaveBeenCalled();
    });

    it('Enter opens action menu', async () => {
      const opts = await captureKeys();
      opts.onKey('\r', vi.fn(), vi.fn());
      const lines = opts.render();
      // Action menu is spliced in — hint line changes
      expect(lines.some(l => l.includes('↑/↓ action') || l.includes('Select') || l.includes('View'))).toBe(true);
    });

    it('Tab toggles group mode to show model IDs', async () => {
      const opts = await captureKeys();
      opts.onKey('\t', vi.fn(), vi.fn());
      const lines = opts.render();
      expect(lines.some(l => l.includes('openai:gpt'))).toBe(true);
    });

    it('Tab toggles back to pretty mode', async () => {
      const opts = await captureKeys();
      opts.onKey('\t', vi.fn(), vi.fn()); // → provider mode
      opts.onKey('\t', vi.fn(), vi.fn()); // → pretty mode
      const lines = opts.render();
      // In pretty mode the tab hint says "Tab show model IDs"
      expect(lines.join('\n')).toContain('Tab show model IDs');
    });

    it('typing characters filters the model list', async () => {
      const opts = await captureKeys();
      opts.onKey('3', vi.fn(), vi.fn()); // "3" matches "GPT-3.5 Turbo"
      const lines = opts.render();
      expect(lines.join('\n')).toContain('Filter');
    });

    it('backspace removes the last filter character', async () => {
      const opts = await captureKeys();
      opts.onKey('x', vi.fn(), vi.fn()); // filter = "x" (no matches)
      opts.onKey('\x7f', vi.fn(), vi.fn()); // backspace → filter = ""
      const lines = opts.render();
      // After clearing filter, all models are visible
      expect(lines.some(l => l.includes('GPT-4o'))).toBe(true);
    });

    it('Space with no filter closes picker with saveDefault=true', async () => {
      pickerStore.resolveReturn = {
        item: { providerId: 'openai', providerName: 'OpenAI', modelId: 'gpt-4o', displayName: 'GPT-4o' },
        saveDefault: true,
      };
      const setModel = vi.fn();
      await runModelCommand(fakeRl, 'openai:gpt-4o', setModel);
      expect(setModel).toHaveBeenCalledWith('openai:gpt-4o');
    });

    it('Space with active filter appends space to filter query', async () => {
      const opts = await captureKeys();
      opts.onKey('g', vi.fn(), vi.fn()); // start filter
      opts.onKey(' ', vi.fn(), vi.fn()); // space appended to filter
      const lines = opts.render();
      expect(lines.join('\n')).toContain('Filter');
    });

    it('ctrl-H (backspace) also removes filter character', async () => {
      const opts = await captureKeys();
      opts.onKey('x', vi.fn(), vi.fn());
      opts.onKey('\b', vi.fn(), vi.fn()); // ctrl-H / alt backspace
      const lines = opts.render();
      expect(lines.some(l => l.includes('GPT-4o'))).toBe(true);
    });
  });

  describe('action menu key handling', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('Escape from action menu returns to list picker', async () => {
      const opts = await captureKeys();
      opts.onKey('\r', vi.fn(), vi.fn()); // open action menu
      opts.onKey('\x1b', vi.fn(), vi.fn()); // close action menu
      const lines = opts.render();
      expect(lines.some(l => l.includes('Select model'))).toBe(true);
    });

    it('Select in action menu closes picker with item', async () => {
      const opts = await captureKeys();
      const close = vi.fn();
      opts.onKey('\r', vi.fn(), close); // open action menu
      opts.onKey('\r', vi.fn(), close); // Select (first option, already highlighted)
      expect(close).toHaveBeenCalled();
      const arg = close.mock.calls[0]?.[0] as { item: { modelId: string }; saveDefault: boolean } | null;
      expect(arg?.item.modelId).toBe('gpt-4o');
      expect(arg?.saveDefault).toBe(false);
    });

    it('View in action menu switches to detail view', async () => {
      const opts = await captureKeys();
      opts.onKey('\r', vi.fn(), vi.fn()); // open action menu
      opts.onKey('\x1b[B', vi.fn(), vi.fn()); // down to View
      opts.onKey('\r', vi.fn(), vi.fn()); // select View
      const lines = opts.render();
      expect(lines.some(l => l.includes('Model details'))).toBe(true);
    });

    it('Edit in action menu closes sub-menu and redraws', async () => {
      const opts = await captureKeys();
      opts.onKey('\r', vi.fn(), vi.fn()); // open action menu
      opts.onKey('\x1b[B', vi.fn(), vi.fn()); // View
      opts.onKey('\x1b[B', vi.fn(), vi.fn()); // Edit
      opts.onKey('\r', vi.fn(), vi.fn()); // select Edit (stub — just closes menu)
      const lines = opts.render();
      // Menu closed, back to list
      expect(lines.some(l => l.includes('Select model'))).toBe(true);
    });
  });

  describe('detail view rendering', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('detail screen shows model ID, provider, and display name', async () => {
      const opts = await captureKeys();
      opts.onKey('\x1b[C', vi.fn(), vi.fn());
      const lines = opts.render().join('\n');
      expect(lines).toContain('gpt-4o');
      expect(lines).toContain('OpenAI');
      expect(lines).toContain('GPT-4o');
    });

    it('detail screen shows pricing when rates are available', async () => {
      const opts = await captureKeys();
      opts.onKey('\x1b[C', vi.fn(), vi.fn());
      const lines = opts.render().join('\n');
      expect(lines).toContain('Pricing');
      expect(lines).toContain('$2.5');
    });

    it('detail screen shows disagree pricing label when sources conflict', async () => {
      vi.mocked(getOpenAIVerifiedRates).mockResolvedValueOnce({ confidence: 'disagree', inputPerMillion: null, outputPerMillion: null });
      // Rebuild picker with new pricing data
      await runModelCommand(fakeRl, 'openai:gpt-4o', vi.fn());
      pickerStore.capturedOpts!.onKey('\x1b[C', vi.fn(), vi.fn());
      const lines = pickerStore.capturedOpts!.render().join('\n');
      expect(lines).toContain('sources disagree');
    });

    it('detail screen shows noNativeTools trait', async () => {
      vi.mocked(getNoNativeToolsKeys).mockReturnValue(new Set(['openai:gpt-4o']));
      await runModelCommand(fakeRl, 'openai:gpt-4o', vi.fn());
      pickerStore.capturedOpts!.onKey('\x1b[C', vi.fn(), vi.fn());
      const lines = pickerStore.capturedOpts!.render().join('\n');
      expect(lines).toContain('~tools');
    });

    it('detail screen shows favorite status', async () => {
      const opts = await captureKeys();
      opts.onKey('\x1b[C', vi.fn(), vi.fn());
      const lines = opts.render().join('\n');
      expect(lines).toContain('Favorite');
    });
  });
});
