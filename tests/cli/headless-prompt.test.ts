import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { CoreMessage } from 'ai';
import type { AgentLoopResult } from '../../src/agent/loop.js';
import { runHeadlessPrompt } from '../../src/cli/headless-prompt.js';
import { getAskMode, isReadOnly } from '../../src/cli/chrome/toggles.js';

const agentLoop = vi.hoisted(() => vi.fn());
vi.mock('../../src/agent/loop.js', () => ({ agentLoop }));

function loopResult(over: Partial<AgentLoopResult> = {}): AgentLoopResult {
  return {
    text: '',
    usage: { totalTokens: 0 },
    providerId: 'zen',
    modelId: 'hy3-free',
    quota: null,
    turnMessages: [],
    ...over,
  };
}

describe('runHeadlessPrompt', () => {
  let stdout: MockInstance;
  let stderr: MockInstance;

  const written = (spy: MockInstance): string =>
    spy.mock.calls.map(c => String(c[0])).join('');

  beforeEach(() => {
    agentLoop.mockReset();
    stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
    vi.unstubAllEnvs();
  });

  it('refuses without a model instead of letting resolveModel explain it', async () => {
    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: '' });

    expect(code).toBe(1);
    expect(agentLoop).not.toHaveBeenCalled();
    expect(written(stderr)).toContain('--model');
    expect(written(stdout)).toBe('');
  });

  it('runs read-only, auto-approving, with the transcript silenced', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    // The same toggles the TUI uses (Ctrl+R / Ctrl+A), not a parallel set of flags.
    expect(isReadOnly()).toBe(true);
    expect(getAskMode()).toBe('auto');
    expect(process.env.FREECODE_TRANSCRIPT_STREAM).toBe('null');
    const options = agentLoop.mock.calls[0][3] as { readOnly: boolean; spawnAgent: boolean };
    expect(options.readOnly).toBe(true);
    expect(options.spawnAgent).toBe(false);
  });

  it('offers the write tools under edit, still without spawn_agent', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: 'answer' }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free', edit: true });

    expect(isReadOnly()).toBe(false);
    // Editing is not fan-out: an unattended turn must not spend whole sub-turns.
    const options = agentLoop.mock.calls[0][3] as { readOnly: boolean; spawnAgent: boolean };
    expect(options.readOnly).toBe(false);
    expect(options.spawnAgent).toBe(false);
  });

  it('prints the final assistant message, not every step of narration', async () => {
    // A turn that narrates before a tool call: result.text holds both, but the
    // caller asked for an answer. See finalResponse in cli/headless-prompt.ts.
    const turnMessages: CoreMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me look at it.' },
          { type: 'tool-call', toolCallId: '1', toolName: 'read', args: { path: 'p' } },
        ],
      },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: '1', toolName: 'read', result: 'body' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'The answer is 42.' }] },
    ];
    agentLoop.mockResolvedValue(
      loopResult({ text: 'Let me look at it.The answer is 42.', turnMessages }),
    );

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(code).toBe(0);
    expect(written(stdout)).toBe('The answer is 42.\n');
  });

  it('skips a trailing tool-call-only message to find the last text', async () => {
    const turnMessages: CoreMessage[] = [
      { role: 'assistant', content: [{ type: 'text', text: 'Findings so far.' }] },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: '2', toolName: 'grep', args: {} }],
      },
    ];
    agentLoop.mockResolvedValue(loopResult({ text: 'Findings so far.', turnMessages }));

    await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(written(stdout)).toBe('Findings so far.\n');
  });

  it('falls back to result.text when the turn contributed no messages', async () => {
    // An errored or aborted turn carries none — whatever it managed to say is all
    // there is, and it is still worth printing.
    agentLoop.mockResolvedValue(loopResult({ text: 'partial thought', error: 'stream died' }));

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(code).toBe(1);
    expect(written(stdout)).toBe('partial thought\n');
    expect(written(stderr)).toContain('stream died');
  });

  it('prints nothing to stdout when the model said nothing', async () => {
    agentLoop.mockResolvedValue(loopResult({ text: '' }));

    const code = await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

    expect(code).toBe(0);
    expect(written(stdout)).toBe('');
  });

  describe('tool call budget', () => {
    it('approves up to the budget and denies past it', async () => {
      vi.stubEnv('FREECODE_MAX_TOOL_CALLS', '2');
      let confirm: () => Promise<{ approved: boolean; message?: string }> = () =>
        Promise.resolve({ approved: false });
      agentLoop.mockImplementation((_m, _r, _model, options: { confirmToolCall: typeof confirm }) => {
        confirm = options.confirmToolCall;
        return Promise.resolve(loopResult({ text: 'done' }));
      });

      await runHeadlessPrompt({ projectRoot: '.', prompt: 'hi', model: 'zen:hy3-free' });

      expect(await confirm()).toEqual({ approved: true });
      expect(await confirm()).toEqual({ approved: true });
      const third = await confirm();
      expect(third.approved).toBe(false);
      expect(third.message).toContain('tool call limit of 2');
    });
  });
});
