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

vi.mock('../../src/store/db.js', () => ({
  ensureStoreReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/config/index.js', () => ({
  resolveApiKey: vi.fn().mockReturnValue(null),
  resolveModelSettings: vi.fn().mockReturnValue({ showProviderUsage: false }),
}));

vi.mock('../../src/providers/provider-registry.js', () => ({
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

const mockAccent = Object.assign((s: string) => s, { bold: (s: string) => s, black: (s: string) => s });
vi.mock('../../src/cli/render/banner.js', () => ({
  redrawBanner: vi.fn(),
  getBannerColor: () => mockAccent,
  getBannerColorRGB: () => [170, 232, 255] as [number, number, number],
}));

vi.mock('../../src/cli/slash-commands.js', () => ({
  showHelp: vi.fn(),
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
import { agentLoop } from '../../src/agent/loop.js';
import { addAnthropicSessionCost, describeCostEstimateBreakdown, resetAnthropicSessionCost } from '../../src/providers/anthropic-cost.js';
import { formatCapturedProviderUsages } from '../../src/providers/adapters/openai-compat.js';
import { redrawBanner } from '../../src/cli/render/banner.js';
import { showHelp } from '../../src/cli/slash-commands.js';
import { resolveApiKey, resolveModelSettings } from '../../src/config/index.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Conversation } from '../../src/agent/conversation.js';
import { ensureStoreReady } from '../../src/store/db.js';
import { runStatusCommand } from '../../src/commands/status.js';
import { runRendererDemo } from '../../src/commands/renderer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// The real Conversation, not a stub: what these tests care about is the history
// a turn leaves behind, and an all-or-nothing commit can only be checked against
// the real append rules.
function makeSession() {
  const session = new Conversation('/test');
  const clearMessages = vi.spyOn(session, 'clearMessages');
  const commitTurn = vi.spyOn(session, 'commitTurn');
  return { session, clearMessages, commitTurn };
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
  // Empty is the error/abort shape — the dispatcher then records `text` alone.
  turnMessages: [],
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
// dispatchCommand — return value (shared invariant across all inputs)
// ---------------------------------------------------------------------------

describe('dispatchCommand — returns continue', () => {
  it.each(['', '   ', '/model', '/config', '/help', '/eval', '/status', '/renderer', '/clear', '/unknown', 'hello'])(
    '%p → continue', async (input) => {
      expect(await dispatchCommand(input, makeRuntime())).toBe('continue');
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
});

// ---------------------------------------------------------------------------
// dispatchCommand — /status
// ---------------------------------------------------------------------------

describe('dispatchCommand — /status', () => {
  it('calls runStatusCommand', async () => {
    await dispatchCommand('/status', makeRuntime());
    expect(runStatusCommand).toHaveBeenCalled();
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
});

// ---------------------------------------------------------------------------
// dispatchCommand — sendToAgent (non-slash input)
// ---------------------------------------------------------------------------

describe('dispatchCommand — sendToAgent', () => {
  it('calls ensureStoreReady before the agent loop', async () => {
    await dispatchCommand('hello', makeRuntime());
    expect(ensureStoreReady).toHaveBeenCalled();
  });

  it('commits the trimmed user message with the reply once the turn succeeds', async () => {
    const { session } = makeSession();
    await dispatchCommand('  hello world  ', makeRuntime({ session }));
    expect(session.messages).toEqual([
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'Hello from AI' },
    ]);
  });

  it('sends the history plus the new user message, without committing it first', async () => {
    const { session } = makeSession();
    session.commitTurn({ role: 'user', content: 'earlier' }, [], 'earlier reply');
    vi.mocked(agentLoop).mockImplementation((messages) => {
      // The message is only a candidate while the turn runs: visible to the
      // model, absent from the session until the turn produces something.
      expect(messages).toEqual([
        { role: 'user', content: 'earlier' },
        { role: 'assistant', content: 'earlier reply' },
        { role: 'user', content: 'hello' },
      ]);
      expect(session.messages).toHaveLength(2);
      return Promise.resolve(DEFAULT_AGENT_RESULT as never);
    });
    await dispatchCommand('hello', makeRuntime({ session }));
    expect(session.messages).toHaveLength(4);
  });

  it('persists the turn messages — tool calls and results — when the turn produced them', async () => {
    const turnMessages = [
      { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'read', args: {} }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'read', result: 'body' }] },
      { role: 'assistant', content: 'Hello from AI' },
    ];
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, turnMessages } as never);
    const { session } = makeSession();
    await dispatchCommand('hello', makeRuntime({ session }));
    expect(session.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    // The final reply comes from turnMessages, not from `text` on top of it —
    // recording both would duplicate it in history.
    expect(session.messages).toHaveLength(4);
  });

  it('leaves history untouched when an aborted turn produced nothing', async () => {
    // The abort shape: agentLoop swallows the UserAbortError and returns the
    // text so far, which is empty when the user escaped before any output.
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, text: '', turnMessages: [] } as never);
    const { session } = makeSession();
    await dispatchCommand('hello', makeRuntime({ session }));
    expect(session.messages).toEqual([]);
  });

  it('leaves history untouched when the turn failed before any output', async () => {
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, text: '', error: 'Context window exceeded' } as never);
    const { session } = makeSession();
    await dispatchCommand('hello', makeRuntime({ session }));
    expect(session.messages).toEqual([]);
  });

  it('never persists the error itself — a failed turn keeps only what the model actually said', async () => {
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, text: 'Working on it.', error: 'Context window exceeded' } as never);
    const { session } = makeSession();
    await dispatchCommand('hello', makeRuntime({ session }));
    expect(session.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Working on it.' },
    ]);
  });

  it('leaves history untouched when agentLoop throws', async () => {
    vi.mocked(agentLoop).mockRejectedValue(new Error('network failure'));
    const { session } = makeSession();
    await dispatchCommand('hello', makeRuntime({ session }));
    expect(session.messages).toEqual([]);
  });

  it('logs a yellow warning when the response text is blank', async () => {
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, text: '   ' } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('empty response'));
  });

  it('does not call a failed turn an empty response — the error was already printed', async () => {
    vi.mocked(agentLoop).mockResolvedValue({ ...DEFAULT_AGENT_RESULT, text: '', error: 'boom' } as never);
    await dispatchCommand('hello', makeRuntime());
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('empty response'));
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

  it('recovers when beforeAgentCall throws: the error is reported, afterAgentCall restores the UI, history is untouched', async () => {
    // beforeAgentCall tears the bottom UI down. When it used to run outside the
    // try the throw escaped the dispatcher, so afterAgentCall never rebuilt it.
    const beforeAgentCall = vi.fn(() => { throw new Error('teardown failed'); });
    const afterAgentCall = vi.fn().mockResolvedValue(undefined);
    const { session } = makeSession();
    await expect(dispatchCommand('hello', makeRuntime({ session, beforeAgentCall, afterAgentCall }))).resolves.toBe('continue');
    expect(afterAgentCall).toHaveBeenCalled();
    expect(agentLoop).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('teardown failed'));
    expect(session.messages).toEqual([]);
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
