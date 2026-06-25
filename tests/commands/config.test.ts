import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

const { store } = vi.hoisted(() => {
  const store = {
    capturedOpts: null as {
      render: () => string[];
      onKey: (key: string, redraw: () => void, close: (v: unknown) => void) => void;
      getControls?: () => string | undefined;
    } | null,
  };
  return { store };
});

vi.mock('../../src/cli/raw-picker.js', () => ({
  runRawPicker: vi.fn().mockImplementation((_rl: unknown, opts: unknown) => {
    store.capturedOpts = opts as typeof store.capturedOpts;
    return Promise.resolve(undefined);
  }),
  countWrappedLines: vi.fn().mockReturnValue(1),
  resetStdinConsoleMode: vi.fn(),
  resetTerminalPrivateModes: vi.fn(),
}));

vi.mock('../../src/cli/terminal-ui.js', () => ({
  isBottomUIActive: vi.fn().mockReturnValue(false),
  setupBottomUI: vi.fn(),
  teardownBottomUI: vi.fn(),
}));

vi.mock('../../src/cli/banner.js', () => ({
  redrawBanner: vi.fn(),
}));

vi.mock('../../src/config/index.js', () => ({
  getConfigPaths: vi.fn().mockReturnValue({ globalPath: '/tmp/freecode-test-config.json' }),
  loadConfig: vi.fn().mockReturnValue({
    toolRationale: false,
    showProviderUsage: true,
    parallelTools: true,
    retryMaxWaitSeconds: 30,
    diffContextLines: 3,
    showEvalDots: false,
    loadAgentsMd: false,
    providerOverrides: { openai: { toolRationale: true } },
    providers: {},
  }),
  readRawConfig: vi.fn().mockReturnValue({
    providerOverrides: { openai: { toolRationale: true } },
  }),
  resolveModelSettings: vi.fn().mockReturnValue({
    toolRationale: false,
    showProviderUsage: true,
    parallelTools: true,
    loadAgentsMd: false,
  }),
  updateGlobalConfig: vi.fn(),
  writeConfigFile: vi.fn(),
}));

vi.mock('../../src/providers/model-store.js', () => ({
  getModelSettings: vi.fn().mockReturnValue({ toolRationale: true }),
  setModelSetting: vi.fn(),
}));

// ── Imports (after mocks are registered) ─────────────────────────────────────

import { runConfigCommand } from '../../src/commands/config.js';
import { updateGlobalConfig, writeConfigFile } from '../../src/config/index.js';
import { setModelSetting } from '../../src/providers/model-store.js';

const fakeRl = { pause: vi.fn(), resume: vi.fn() } as unknown as Interface;

function makeRedraw() { return vi.fn(); }
function makeClose() { return vi.fn(); }

describe('runConfigCommand', () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    originalIsTTY = process.stdin.isTTY;
    store.capturedOpts = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
    vi.restoreAllMocks();
  });

  it('prints an error and returns immediately when stdin is not a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });

    await runConfigCommand(fakeRl);

    expect(logged.some(l => l.includes('interactive terminal'))).toBe(true);
    expect(store.capturedOpts).toBeNull();
  });

  describe('TTY mode — render', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });
    });

    it('renders global tab screen with settings', async () => {
      await runConfigCommand(fakeRl);
      expect(store.capturedOpts).not.toBeNull();
      const lines = store.capturedOpts!.render();
      const joined = lines.join('\n');
      expect(joined).not.toContain('freecode config');
      expect(joined).not.toContain('/tmp/freecode-test-config.json');
      expect(joined).toContain('Tool rationale');
      expect(joined).toContain('Provider usage');
    });

    it('renders global-only numeric settings (retryMaxWaitSeconds, diffContextLines) on global tab', async () => {
      await runConfigCommand(fakeRl);
      const lines = store.capturedOpts!.render();
      const joined = lines.join('\n');
      expect(joined).toContain('Max retry wait');
      expect(joined).toContain('Diff context');
    });

    it('renders model-only settings absent on global tab', async () => {
      await runConfigCommand(fakeRl);
      const lines = store.capturedOpts!.render();
      expect(lines.join('\n')).not.toContain('Load AGENTS.md');
    });

    it('renders with a model — shows provider and model tabs', async () => {
      await runConfigCommand(fakeRl, 'openai:gpt-4o');
      const lines = store.capturedOpts!.render();
      const joined = lines.join('\n');
      expect(joined).toContain('Global');
      expect(joined).toContain('Provider');
      expect(joined).toContain('Model');
    });

    it('renders hint line with navigation instructions', async () => {
      await runConfigCommand(fakeRl);
      const ctrl = store.capturedOpts!.getControls?.();
      expect(ctrl).toContain('select');
    });
  });

  describe('TTY mode — key handling', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });
    });

    it('q key closes the picker', async () => {
      await runConfigCommand(fakeRl);
      const close = makeClose();
      store.capturedOpts!.onKey('q', makeRedraw(), close);
      expect(close).toHaveBeenCalled();
    });

    it('Q key closes the picker', async () => {
      await runConfigCommand(fakeRl);
      const close = makeClose();
      store.capturedOpts!.onKey('Q', makeRedraw(), close);
      expect(close).toHaveBeenCalled();
    });

    it('Escape key closes the picker', async () => {
      await runConfigCommand(fakeRl);
      const close = makeClose();
      store.capturedOpts!.onKey('\x1b', makeRedraw(), close);
      expect(close).toHaveBeenCalled();
    });

    it('up arrow moves selection up', async () => {
      await runConfigCommand(fakeRl);
      const redraw = makeRedraw();
      store.capturedOpts!.onKey('\x1b[B', redraw, makeClose());
      store.capturedOpts!.onKey('\x1b[A', redraw, makeClose());
      expect(redraw).toHaveBeenCalledTimes(2);
    });

    it('up arrow from index 0 moves to tab row (sel = -1)', async () => {
      await runConfigCommand(fakeRl, 'openai:gpt-4o');
      const redraw = makeRedraw();
      store.capturedOpts!.onKey('\x1b[A', redraw, makeClose());
      expect(redraw).toHaveBeenCalled();
      const lines = store.capturedOpts!.render();
      expect(lines.join('\n')).toContain('Global');
    });

    it('down arrow moves selection down', async () => {
      await runConfigCommand(fakeRl);
      const redraw = makeRedraw();
      store.capturedOpts!.onKey('\x1b[B', redraw, makeClose());
      expect(redraw).toHaveBeenCalled();
    });

    it('down arrow from tab row (sel=-1) moves back to first setting', async () => {
      await runConfigCommand(fakeRl, 'openai:gpt-4o');
      store.capturedOpts!.onKey('\x1b[A', makeRedraw(), makeClose());
      const redraw = makeRedraw();
      store.capturedOpts!.onKey('\x1b[B', redraw, makeClose());
      expect(redraw).toHaveBeenCalled();
    });

    it('right arrow on global boolean setting toggles value and saves', async () => {
      await runConfigCommand(fakeRl);
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose());
      expect(updateGlobalConfig).toHaveBeenCalled();
    });

    it('left arrow on global boolean setting toggles value and saves', async () => {
      await runConfigCommand(fakeRl);
      store.capturedOpts!.onKey('\x1b[D', makeRedraw(), makeClose());
      expect(updateGlobalConfig).toHaveBeenCalled();
    });

    it('space bar on global boolean setting toggles value and saves', async () => {
      await runConfigCommand(fakeRl);
      store.capturedOpts!.onKey(' ', makeRedraw(), makeClose());
      expect(updateGlobalConfig).toHaveBeenCalled();
    });

    it('enter key on global boolean setting toggles value and saves', async () => {
      await runConfigCommand(fakeRl);
      store.capturedOpts!.onKey('\r', makeRedraw(), makeClose());
      expect(updateGlobalConfig).toHaveBeenCalled();
    });
  });

  describe('TTY mode — numeric setting', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });
    });

    it('right arrow on numeric setting increments the value', async () => {
      await runConfigCommand(fakeRl);
      // Navigate to retryMaxWaitSeconds (index 3 in SETTINGS, 0-based)
      for (let i = 0; i < 3; i++) store.capturedOpts!.onKey('\x1b[B', makeRedraw(), makeClose());
      vi.mocked(updateGlobalConfig).mockClear();
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose());
      expect(updateGlobalConfig).toHaveBeenCalled();
      const [arg] = vi.mocked(updateGlobalConfig).mock.calls[0] ?? [];
      expect(arg).toHaveProperty('retryMaxWaitSeconds');
    });

    it('left arrow on numeric setting decrements the value', async () => {
      await runConfigCommand(fakeRl);
      for (let i = 0; i < 3; i++) store.capturedOpts!.onKey('\x1b[B', makeRedraw(), makeClose());
      vi.mocked(updateGlobalConfig).mockClear();
      store.capturedOpts!.onKey('\x1b[D', makeRedraw(), makeClose());
      expect(updateGlobalConfig).toHaveBeenCalled();
      const [arg2] = vi.mocked(updateGlobalConfig).mock.calls[0] ?? [];
      expect(arg2).toHaveProperty('retryMaxWaitSeconds');
    });
  });

  describe('TTY mode — provider tab', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });
    });

    async function openProviderTab() {
      await runConfigCommand(fakeRl, 'openai:gpt-4o');
      store.capturedOpts!.onKey('\x1b[A', makeRedraw(), makeClose());
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose());
    }

    it('switches to provider tab on right arrow from tab row', async () => {
      await openProviderTab();
      const lines = store.capturedOpts!.render();
      expect(lines.join('\n')).toContain('Provider');
    });

    it('provider tab shows override settings', async () => {
      await openProviderTab();
      const lines = store.capturedOpts!.render();
      expect(lines.join('\n')).toContain('Tool rationale');
    });

    it('right arrow on provider tab setting cycles override and writes config', async () => {
      await openProviderTab();
      store.capturedOpts!.onKey('\x1b[B', makeRedraw(), makeClose());
      vi.mocked(writeConfigFile).mockClear();
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose());
      expect(writeConfigFile).toHaveBeenCalled();
    });
  });

  describe('TTY mode — model tab', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });
    });

    async function openModelTab() {
      await runConfigCommand(fakeRl, 'openai:gpt-4o');
      store.capturedOpts!.onKey('\x1b[A', makeRedraw(), makeClose());
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose());
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose());
    }

    it('switches to model tab on double right arrow from tab row', async () => {
      await openModelTab();
      const lines = store.capturedOpts!.render();
      expect(lines.join('\n')).toContain('Model');
    });

    it('right arrow on model tab setting calls setModelSetting', async () => {
      await openModelTab();
      store.capturedOpts!.onKey('\x1b[B', makeRedraw(), makeClose());
      vi.mocked(setModelSetting).mockClear();
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose());
      expect(setModelSetting).toHaveBeenCalled();
    });
  });

  describe('TTY mode — tab switching boundary', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
      Object.defineProperty(process.stdout, 'rows', { value: 40, configurable: true });
    });

    it('left arrow on tab row at global (leftmost) does not wrap', async () => {
      await runConfigCommand(fakeRl, 'openai:gpt-4o');
      store.capturedOpts!.onKey('\x1b[A', makeRedraw(), makeClose());
      store.capturedOpts!.onKey('\x1b[D', makeRedraw(), makeClose());
      const lines = store.capturedOpts!.render();
      expect(lines.join('\n')).toContain('Global');
    });

    it('right arrow past last tab does not overflow', async () => {
      await runConfigCommand(fakeRl, 'openai:gpt-4o');
      store.capturedOpts!.onKey('\x1b[A', makeRedraw(), makeClose());
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose()); // → provider
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose()); // → model
      store.capturedOpts!.onKey('\x1b[C', makeRedraw(), makeClose()); // → stays at model
      const lines = store.capturedOpts!.render();
      expect(lines.join('\n')).toContain('Model');
    });
  });
});
