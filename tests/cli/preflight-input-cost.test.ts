import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PreflightInputCost } from '../../src/cli/terminal-ui.js';
import {
  createOpenAIPreflightInputController,
  resetOpenAIPreflightCache,
} from '../../src/cli/preflight-input-cost.js';

function flushPromises(): Promise<void> {
  return Promise.resolve();
}

describe('OpenAI preflight input cost controller', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENAI_API_KEY;
    resetOpenAIPreflightCache();
  });

  it('skips empty input and slash commands silently, but reports gated preflight for typed prompts', () => {
    vi.useFakeTimers();
    const countInputTokens = vi.fn();
    const snapshots: PreflightInputCost[] = [];
    const controller = createOpenAIPreflightInputController({
      getMessages: () => [],
      getSelectedModel: () => 'groq:llama',
      setPreflightInputCost: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
      debounceMs: 1,
      countInputTokens,
    });

    controller.schedule('hello');
    controller.schedule('');
    controller.schedule('/model');
    controller.schedule('hello');

    expect(countInputTokens).not.toHaveBeenCalled();
    expect(snapshots[0]).toMatchObject({ state: 'idle', warning: 'selected groq:llama' });
    expect(snapshots[1]).toMatchObject({ state: 'idle' });
    expect(snapshots[1]).not.toHaveProperty('warning');
    expect(snapshots[2]).toMatchObject({ state: 'idle' });
    expect(snapshots[2]).not.toHaveProperty('warning');
    expect(snapshots[3]).toMatchObject({ state: 'idle', warning: 'selected groq:llama' });
  });

  it('reports a missing OpenAI key instead of silently hiding preflight', () => {
    vi.useFakeTimers();
    const countInputTokens = vi.fn();
    const snapshots: PreflightInputCost[] = [];
    const controller = createOpenAIPreflightInputController({
      getMessages: () => [],
      getSelectedModel: () => 'openai:gpt-5',
      setPreflightInputCost: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
      debounceMs: 1,
      countInputTokens,
      hasApiKey: () => false,
    });

    controller.schedule('hello');

    expect(countInputTokens).not.toHaveBeenCalled();
    expect(snapshots.at(-1)).toMatchObject({ state: 'idle', warning: 'OPENAI_API_KEY missing' });
  });

  it('debounces requests and caches by payload hash', async () => {
    vi.useFakeTimers();
    process.env.OPENAI_API_KEY = 'test-key';
    const snapshots: PreflightInputCost[] = [];
    const countInputTokens = vi.fn((_provider: unknown, payload: unknown) => Promise.resolve({
      inputTokens: 100,
      payloadHash: JSON.stringify(payload).length.toString(),
    }));
    const controller = createOpenAIPreflightInputController({
      getMessages: () => [{ role: 'user', content: 'history' }],
      getSelectedModel: () => 'openai:gpt-5',
      setPreflightInputCost: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
      debounceMs: 25,
      countInputTokens,
      getRates: () => Promise.resolve({ confidence: 'agreed' as const, inputPerMillion: 2, outputPerMillion: 8 }),
    });

    controller.schedule('hello');
    await vi.advanceTimersByTimeAsync(24);
    expect(countInputTokens).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(countInputTokens).toHaveBeenCalledTimes(1);
    expect(snapshots.at(-1)).toMatchObject({
      state: 'ready',
      inputTokens: 100,
      formattedInputUsd: '$0.000200 USD',
    });

    controller.schedule('hello');
    await vi.advanceTimersByTimeAsync(25);
    await flushPromises();
    expect(countInputTokens).toHaveBeenCalledTimes(1);
  });

  it('ignores stale count responses after input changes', async () => {
    vi.useFakeTimers();
    process.env.OPENAI_API_KEY = 'test-key';
    const snapshots: PreflightInputCost[] = [];
    let resolveFirst!: (value: { inputTokens: number; payloadHash: string }) => void;
    let resolveSecond!: (value: { inputTokens: number; payloadHash: string }) => void;
    const first = new Promise<{ inputTokens: number; payloadHash: string }>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<{ inputTokens: number; payloadHash: string }>((resolve) => { resolveSecond = resolve; });
    const countInputTokens = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const controller = createOpenAIPreflightInputController({
      getMessages: () => [],
      getSelectedModel: () => 'openai:gpt-5',
      setPreflightInputCost: (snapshot) => snapshots.push(snapshot),
      redraw: vi.fn(),
      debounceMs: 1,
      countInputTokens,
      getRates: () => Promise.resolve({ confidence: 'agreed' as const, inputPerMillion: 1, outputPerMillion: 1 }),
    });

    controller.schedule('first');
    await vi.advanceTimersByTimeAsync(1);
    controller.schedule('second');
    await vi.advanceTimersByTimeAsync(1);
    resolveSecond({ inputTokens: 22, payloadHash: 'second' });
    await flushPromises();
    resolveFirst({ inputTokens: 11, payloadHash: 'first' });
    await flushPromises();

    expect(snapshots.at(-1)).toMatchObject({ state: 'ready', inputTokens: 22, payloadHash: 'second' });
  });
});
