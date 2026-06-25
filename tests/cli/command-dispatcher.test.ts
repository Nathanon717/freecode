import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

// Hoisted mutable registry — mutate in tests, factory captures the same array ref
const mockProviderRegistry = vi.hoisted(() => [] as Array<{
  name: string;
  id: string;
  models: Array<{ displayName: string; id: string }>;
}>);

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('[]'),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/providers/db.js', () => ({
  ensureStoreReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/index.js', () => ({
  resolveApiKey: vi.fn().mockReturnValue(null),
  resolveModelSettings: vi.fn().mockReturnValue({ showProviderUsage: false }),
}));

vi.mock('../../src/providers/registry.js', () => ({
  PROVIDER_REGISTRY: mockProviderRegistry,
}));

vi.mock('../../src/providers/anthropic-cost.js', () => ({
  addAnthropicSessionCost: vi.fn().mockReturnValue(0.005),
  describeCostEstimate: vi.fn().mockReturnValue('$0.001'),
  describeCostEstimateBreakdown: vi.fn().mockReturnValue(null),
  formatUsdCeil: vi.fn().mockReturnValue('$0.01'),
  resetAnthropicSessionCost: vi.fn(),
}));

vi.mock('../../src/providers/adapters/openai-compat.js', () => ({
  formatCapturedProviderUsages: vi.fn().mockReturnValue(null),
}));

vi.mock('../../src/cli/banner.js', () => ({
  redrawBanner: vi.fn(),
}));

vi.mock('../../src/cli/slash-commands.js', () => ({
  showHelp: vi.fn(),
}));

vi.mock('../../src/cli/terminal-ui.js', () => ({
  setTokenCount: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/agent/loop.js', () => ({
  agentLoop: vi.fn(),
}));

vi.mock('../../src/commands/status.js', () => ({
  runStatusCommand: vi.fn(),
}));

vi.mock('../../src/commands/renderer.js', () => ({
  runRendererDemo: vi.fn(),
}));

import {
  dispatchCommand,
  type CommandRuntime,
} from '../../src/cli/command-dispatcher.js';
import { formatQuotaReset } from '../../src/cli/footer-status.js';
import { agentLoop } from '../../src/agent/loop.js';
import { addAnthropicSessionCost, describeCostEstimateBreakdown, resetAnthropicSessionCost } from '../../src/providers/anthropic-cost.js';
import { formatCapturedProviderUsages } from '../../src/providers/adapters/openai-compat.js';
import { redrawBanner } from '../../src/cli/banner.js';
import { showHelp } from '../../src/cli/slash-commands.js';
import { setTokenCount } from '../../src/cli/terminal-ui.js';
import { resolveApiKey, resolveModelSettings } from '../../src/config/index.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { ensureStoreReady } from '../../src/providers/db.js';
import { runStatusCommand } from '../../src/commands/status.js';
import { runRendererDemo } from '../../src/commands/renderer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession() {
  const clearMessages = vi.fn();
  const addUserMessage = vi.fn();
  const addAssistantMessage = vi.fn();
  const getContextTokenCount = vi.fn(() => 0);
  const session = {
    messages: [] as unknown[],
    clearMessages,
    addUserMessage,
    addAssistantMessage,
    getContextTokenCount,
  };
  return { session: session as unknown as CommandRuntime['session'], clearMessages, addUserMessage, addAssistantMessage };
}

function makeRuntime(overrides: Partial<CommandRuntime> = {}): CommandRuntime {
  const { session } = makeSession();
  return {
    projectRoot: '/test',
    session,
    getSelectedModel: vi.fn(() => 'openai:gpt-4'),
    setSelectedModel: vi.fn(),
    confirmToolCall: vi.fn().mockResolvedValue({ approved: true }),
    modelListMode: 'full',
    runEvalMenu: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const DEFAULT_AGENT_RESULT = {
  text: 'Hello from AI',
  usage: { totalTokens: 100, promptTokens: 80, outputTokens: 20 },
  providerId: 'openai',
  modelId: 'gpt-4',
  quota: null,
  costEstimate: null,
  providerUsage: null,
};

let consoleSpy: MockInstance;

beforeEach(() => {
  vi.clearAllMocks();
  mockProviderRegistry.splice(0);
  vi.mocked(agentLoop).mockResolvedValue(DEFAULT_AGENT_RESULT as never);
  vi.mocked(resolveApiKey).mockReturnValue(null);
  vi.mocked(resolveModelSettings).mockReturnValue({ showProviderUsage: false } as never);
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readFileSync).mockReturnValue('[]');
  consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['FREECODE_RESULT_JSON'];
});

// ---------------------------------------------------------------------------
// formatQuotaReset
// ---------------------------------------------------------------------------

describe('formatQuotaReset', () => {
  it('returns ? when both ms and raw are null', () => {
    expect(formatQuotaReset(null, null)).toBe('?');
  });

  // Raw string takes precedence and is returned verbatim, regardless of ms.
  it.each([
    [259_200, '4m19.2s', '4m19.2s'],
    [5_130, '5.13s', '5.13s'],
    [300, '300ms', '300ms'],
    [null, 'garbage', 'garbage'],
  ])('returns raw string %p / %p verbatim', (ms, raw, expected) => {
    expect(formatQuotaReset(ms, raw)).toBe(expected);
  });

  // Falls back to formatting ms when raw is null or whitespace-only.
  it.each([
    [259_200, null, '4m19s'],
    [3_600_000, null, '1h'],
    [3_660_000, null, '1h1m'],
    [3_661_000, null, '1h1m1s'],
    [60_000, null, '1m'],
    [65_000, null, '1m5s'],
    [5_000, null, '5s'],
    [0, null, '0s'],
    [5_000, '   ', '5s'],
  ])('formats %p ms as %p', (ms, raw, expected) => {
    expect(formatQuotaReset(ms, raw)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — empty / whitespace
// ---------------------------------------------------------------------------

describe('dispatchCommand — empty / whitespace', () => {
  it('returns continue for empty string', async () => {
    expect(await dispatchCommand('', makeRuntime())).toBe('continue');
  });

  it('returns continue for whitespace-only input', async () => {
    expect(await dispatchCommand('   ', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — scripted-confirmation skipping
// ---------------------------------------------------------------------------

describe('dispatchCommand — skipStrayConfirmations', () => {
  function makeSkipRuntime() {
    return makeRuntime({ skipStrayConfirmations: true });
  }

  it.each(['y', 'yes', 'n', 'no'])('skips "%s" when skipStrayConfirmations is true', async (input) => {
    expect(await dispatchCommand(input, makeSkipRuntime())).toBe('continue');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pending tool request'));
    expect(agentLoop).not.toHaveBeenCalled();
  });

  it('does not skip normal text when skipStrayConfirmations is true', async () => {
    await dispatchCommand('hello world', makeSkipRuntime());
    expect(agentLoop).toHaveBeenCalled();
  });

  it('does not skip confirmations when skipStrayConfirmations is false', async () => {
    await dispatchCommand('y', makeRuntime({ skipStrayConfirmations: false }));
    expect(agentLoop).toHaveBeenCalled();
  });

  it('treats "YES" (uppercase) as a stray confirmation', async () => {
    expect(await dispatchCommand('YES', makeSkipRuntime())).toBe('continue');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No pending tool request'));
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /model and /models
// ---------------------------------------------------------------------------

describe('dispatchCommand — /model', () => {
  it('calls runModelMenu when provided and no arg', async () => {
    const runModelMenu = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('/model', makeRuntime({ runModelMenu }));
    expect(runModelMenu).toHaveBeenCalled();
  });

  it('calls runModelMenu for /models with no arg', async () => {
    const runModelMenu = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('/models', makeRuntime({ runModelMenu }));
    expect(runModelMenu).toHaveBeenCalled();
  });

  it('falls back to showModelStatus (current-only) when runModelMenu is absent', async () => {
    await dispatchCommand('/model', makeRuntime({ modelListMode: 'current-only' }));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Current model'));
  });

  it('sets model when arg is provided via /model', async () => {
    const setSelectedModel = vi.fn();
    await dispatchCommand('/model anthropic:claude-3', makeRuntime({ setSelectedModel }));
    expect(setSelectedModel).toHaveBeenCalledWith('anthropic:claude-3');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Model set to'));
  });

  it('sets model when arg is provided via /models', async () => {
    const setSelectedModel = vi.fn();
    await dispatchCommand('/models anthropic:claude-3', makeRuntime({ setSelectedModel }));
    expect(setSelectedModel).toHaveBeenCalledWith('anthropic:claude-3');
  });

  it('returns continue', async () => {
    const runModelMenu = vi.fn().mockResolvedValue(undefined);
    expect(await dispatchCommand('/model', makeRuntime({ runModelMenu }))).toBe('continue');
  });

  it('shows "No providers configured" when modelListMode=full and no API keys', async () => {
    await dispatchCommand('/model', makeRuntime({ modelListMode: 'full' }));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No providers configured'));
  });

  it('lists provider models when an API key is available', async () => {
    mockProviderRegistry.push({
      name: 'OpenAI',
      id: 'openai',
      models: [{ displayName: 'GPT-4', id: 'gpt-4' }],
    });
    vi.mocked(resolveApiKey).mockReturnValue('sk-test');
    await dispatchCommand('/model', makeRuntime({ modelListMode: 'full' }));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('OpenAI'));
  });

  it('treats /MODEL (uppercase) as /model', async () => {
    const runModelMenu = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('/MODEL', makeRuntime({ runModelMenu }));
    expect(runModelMenu).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /config
// ---------------------------------------------------------------------------

describe('dispatchCommand — /config', () => {
  it('calls runConfig when provided', async () => {
    const runConfig = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('/config', makeRuntime({ runConfig }));
    expect(runConfig).toHaveBeenCalled();
  });

  it('logs a dim message when runConfig is absent', async () => {
    await dispatchCommand('/config', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/config is only available in interactive mode'));
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/config', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /help
// ---------------------------------------------------------------------------

describe('dispatchCommand — /help', () => {
  it('calls showHelp', async () => {
    await dispatchCommand('/help', makeRuntime());
    expect(showHelp).toHaveBeenCalled();
  });

  it('logs the Flags section', async () => {
    await dispatchCommand('/help', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Flags'));
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/help', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /eval
// ---------------------------------------------------------------------------

describe('dispatchCommand — /eval', () => {
  it('calls runEvalMenu', async () => {
    const runEvalMenu = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('/eval', makeRuntime({ runEvalMenu }));
    expect(runEvalMenu).toHaveBeenCalled();
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/eval', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /humaneval
// ---------------------------------------------------------------------------

describe('dispatchCommand — /humaneval', () => {
  it('calls runHumanEvalMenu when provided', async () => {
    const runHumanEvalMenu = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('/humaneval', makeRuntime({ runHumanEvalMenu }));
    expect(runHumanEvalMenu).toHaveBeenCalled();
  });

  it('logs a dim message when runHumanEvalMenu is absent', async () => {
    await dispatchCommand('/humaneval', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('/humaneval is only available in interactive mode'));
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/humaneval', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /status
// ---------------------------------------------------------------------------

describe('dispatchCommand — /status', () => {
  it('calls runStatusCommand', async () => {
    await dispatchCommand('/status', makeRuntime());
    expect(runStatusCommand).toHaveBeenCalled();
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/status', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /renderer
// ---------------------------------------------------------------------------

describe('dispatchCommand — /renderer', () => {
  it('calls runRendererDemo', async () => {
    await dispatchCommand('/renderer', makeRuntime());
    expect(runRendererDemo).toHaveBeenCalled();
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/renderer', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — /clear
// ---------------------------------------------------------------------------

describe('dispatchCommand — /clear', () => {
  it('clears session messages', async () => {
    const { session, clearMessages } = makeSession();
    await dispatchCommand('/clear', makeRuntime({ session }));
    expect(clearMessages).toHaveBeenCalled();
  });

  it('resets anthropic session cost', async () => {
    await dispatchCommand('/clear', makeRuntime());
    expect(resetAnthropicSessionCost).toHaveBeenCalled();
  });

  it('redraws the banner', async () => {
    await dispatchCommand('/clear', makeRuntime());
    expect(redrawBanner).toHaveBeenCalled();
  });

  it('logs history-cleared message', async () => {
    await dispatchCommand('/clear', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Chat history cleared'));
  });

  it('calls beforeScreenClear and afterScreenClear when provided', async () => {
    const beforeScreenClear = vi.fn().mockResolvedValue(undefined);
    const afterScreenClear = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('/clear', makeRuntime({ beforeScreenClear, afterScreenClear }));
    expect(beforeScreenClear).toHaveBeenCalled();
    expect(afterScreenClear).toHaveBeenCalled();
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/clear', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — unknown slash command
// ---------------------------------------------------------------------------

describe('dispatchCommand — unknown slash command', () => {
  it('logs "No command" for an unknown slash command', async () => {
    await dispatchCommand('/unknown', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No command: /unknown'));
  });

  it('uses only the first token in the error message', async () => {
    await dispatchCommand('/foo bar baz', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No command: /foo'));
  });

  it('returns continue', async () => {
    expect(await dispatchCommand('/unknown', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — sendToAgent (non-slash input)
// ---------------------------------------------------------------------------

describe('dispatchCommand — sendToAgent', () => {
  it('calls ensureStoreReady before the agent loop', async () => {
    await dispatchCommand('hello', makeRuntime());
    expect(ensureStoreReady).toHaveBeenCalled();
  });

  it('adds the trimmed user message to the session', async () => {
    const { session, addUserMessage } = makeSession();
    await dispatchCommand('  hello world  ', makeRuntime({ session }));
    expect(addUserMessage).toHaveBeenCalledWith('hello world');
  });

  it('calls agentLoop with the session messages', async () => {
    await dispatchCommand('hello', makeRuntime());
    expect(agentLoop).toHaveBeenCalled();
  });

  it('adds the assistant reply to the session', async () => {
    const { session, addAssistantMessage } = makeSession();
    await dispatchCommand('hello', makeRuntime({ session }));
    expect(addAssistantMessage).toHaveBeenCalledWith('Hello from AI');
  });

  it('calls setTokenCount when promptTokens is defined', async () => {
    await dispatchCommand('hello', makeRuntime());
    expect(setTokenCount).toHaveBeenCalledWith(80);
  });

  it('does not call setTokenCount when promptTokens is undefined', async () => {
    vi.mocked(agentLoop).mockResolvedValue({
      ...DEFAULT_AGENT_RESULT,
      usage: { totalTokens: 100 },
    } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(setTokenCount).not.toHaveBeenCalled();
  });

  it('logs a yellow warning when the response text is blank', async () => {
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, text: '   ' } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('empty response'));
  });

  it('calls beforeAgentCall and afterAgentCall hooks in order', async () => {
    const calls: string[] = [];
    const beforeAgentCall = vi.fn(() => { calls.push('before'); return Promise.resolve(); });
    const afterAgentCall = vi.fn(() => { calls.push('after'); return Promise.resolve(); });
    await dispatchCommand('hello', makeRuntime({ beforeAgentCall, afterAgentCall }));
    expect(calls).toEqual(['before', 'after']);
  });

  it('calls onAgentResult with the loop result', async () => {
    const onAgentResult = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('hello', makeRuntime({ onAgentResult }));
    expect(onAgentResult).toHaveBeenCalledWith(DEFAULT_AGENT_RESULT);
  });

  it('calls afterAgentCall even when agentLoop throws', async () => {
    vi.mocked(agentLoop).mockRejectedValue(new Error('boom'));
    const afterAgentCall = vi.fn().mockResolvedValue(undefined);
    await dispatchCommand('hello', makeRuntime({ afterAgentCall }));
    expect(afterAgentCall).toHaveBeenCalled();
  });

  it('logs a red error message when agentLoop throws', async () => {
    vi.mocked(agentLoop).mockRejectedValue(new Error('network failure'));
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('network failure'));
  });

  it('shows anthropic cost when provider is anthropic', async () => {
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, providerId: 'anthropic' } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(addAnthropicSessionCost).toHaveBeenCalled();
  });

  it('shows cost breakdown when describeCostEstimateBreakdown returns a string', async () => {
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, providerId: 'anthropic' } as never);
    vi.mocked(describeCostEstimateBreakdown).mockReturnValue('cache: $0.0001');
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('cache'));
  });

  it('shows provider usage when showProviderUsage is true and usage is available', async () => {
    vi.mocked(formatCapturedProviderUsages).mockReturnValue('tokens: 100');
    vi.mocked(resolveModelSettings).mockReturnValue({ showProviderUsage: true } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Provider usage'));
  });

  it('does not show provider usage when showProviderUsage is false', async () => {
    vi.mocked(formatCapturedProviderUsages).mockReturnValue('tokens: 100');
    vi.mocked(resolveModelSettings).mockReturnValue({ showProviderUsage: false } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Provider usage'));
  });

  it('does not show provider usage when formatCapturedProviderUsages returns null', async () => {
    vi.mocked(formatCapturedProviderUsages).mockReturnValue(null);
    vi.mocked(resolveModelSettings).mockReturnValue({ showProviderUsage: true } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Provider usage'));
  });

  it('returns continue after a successful agent call', async () => {
    expect(await dispatchCommand('hello', makeRuntime())).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// dispatchCommand — FREECODE_RESULT_JSON handling
// ---------------------------------------------------------------------------

describe('dispatchCommand — FREECODE_RESULT_JSON', () => {
  const RESULT_PATH = '/tmp/freecode-test-result.json';

  beforeEach(() => {
    process.env['FREECODE_RESULT_JSON'] = RESULT_PATH;
  });

  it('writes a placeholder entry before calling agentLoop', async () => {
    await dispatchCommand('hello', makeRuntime());
    const firstWrite = vi.mocked(writeFileSync).mock.calls[0];
    expect(firstWrite).toBeDefined();
    const payload = JSON.parse(firstWrite[1] as string) as Array<Record<string, unknown>>;
    expect(payload[0]).toMatchObject({ providerId: 'openai', modelId: 'gpt-4', totalTokens: 0 });
  });

  it('replaces the placeholder with the final result', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify([{ placeholder: true }]));
    await dispatchCommand('hello', makeRuntime());
    const lastWrite = vi.mocked(writeFileSync).mock.calls.at(-1);
    expect(lastWrite).toBeDefined();
    const payload = JSON.parse(lastWrite![1] as string) as Array<Record<string, unknown>>;
    expect(payload[0]).toMatchObject({ totalTokens: 100, providerId: 'openai', modelId: 'gpt-4' });
  });

  it('updates the entry via onPartialResult when quota is non-null', async () => {
    vi.mocked(agentLoop).mockImplementation((_msgs, _root, _model, opts) => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify([{ placeholder: true }]));
      opts?.onPartialResult?.({ quota: { resetMs: 5000, raw: '5s' } } as never);
      return Promise.resolve(DEFAULT_AGENT_RESULT as never);
    });
    await dispatchCommand('hello', makeRuntime());
    // placeholder write + partial write + final write = at least 2 writes
    expect(vi.mocked(writeFileSync).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('skips partial update when quota is null', async () => {
    let writeCountDuringLoop = 0;
    vi.mocked(agentLoop).mockImplementation((_msgs, _root, _model, opts) => {
      opts?.onPartialResult?.({ quota: null } as never);
      writeCountDuringLoop = vi.mocked(writeFileSync).mock.calls.length;
      return Promise.resolve(DEFAULT_AGENT_RESULT as never);
    });
    await dispatchCommand('hello', makeRuntime());
    // Only the placeholder write happened before the loop body ran
    expect(writeCountDuringLoop).toBe(1);
  });

  it('appends a new entry when no file exists at final write time', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await dispatchCommand('hello', makeRuntime());
    const lastWrite = vi.mocked(writeFileSync).mock.calls.at(-1);
    expect(lastWrite).toBeDefined();
    const payload = JSON.parse(lastWrite![1] as string) as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({ totalTokens: 100 });
  });

  it('handles model string without a colon in the placeholder', async () => {
    const getSelectedModel = vi.fn(() => 'gpt-4');
    await dispatchCommand('hello', makeRuntime({ getSelectedModel }));
    const firstWrite = vi.mocked(writeFileSync).mock.calls[0];
    expect(firstWrite).toBeDefined();
    const payload = JSON.parse(firstWrite[1] as string) as Array<Record<string, unknown>>;
    expect(payload[0]).toMatchObject({ providerId: '', modelId: 'gpt-4', totalTokens: 0 });
  });
});
