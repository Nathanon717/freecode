import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { agentLoop } from '../../src/agent/loop.js';
import { resetFakeModelState } from '../../src/providers/fake.js';
import { setModelSetting } from '../../src/providers/model-data.js';

const previousFake = process.env.FREECODE_FAKE_LLM;
const previousScript = process.env.FREECODE_FAKE_LLM_SCRIPT;
const previousNoLlm = process.env.FREECODE_NO_LLM;

let tempRoot = '';
let stdoutSpy: MockInstance;

function writeFixture(value: unknown): void {
  const fixturePath = join(tempRoot, 'fixture.llm.json');
  writeFileSync(fixturePath, JSON.stringify(value, null, 2), 'utf-8');
  process.env.FREECODE_FAKE_LLM_SCRIPT = fixturePath;
}

const approve = () => Promise.resolve(true);

describe('agentLoop dispatch', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-agent-loop-'));
    resetFakeModelState();
    process.env.FREECODE_FAKE_LLM = '1';
    delete process.env.FREECODE_NO_LLM;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    stdoutSpy.mockRestore();
    resetFakeModelState();
    if (previousFake === undefined) delete process.env.FREECODE_FAKE_LLM;
    else process.env.FREECODE_FAKE_LLM = previousFake;
    if (previousScript === undefined) delete process.env.FREECODE_FAKE_LLM_SCRIPT;
    else process.env.FREECODE_FAKE_LLM_SCRIPT = previousScript;
    if (previousNoLlm === undefined) delete process.env.FREECODE_NO_LLM;
    else process.env.FREECODE_NO_LLM = previousNoLlm;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('blocks all LLM access when FREECODE_NO_LLM=1', async () => {
    process.env.FREECODE_NO_LLM = '1';

    const result = await agentLoop(
      [{ role: 'user', content: 'ping' }],
      tempRoot,
      'mock:gpt-freecode-test',
    );

    // Reported through `error`, never as assistant text — see AgentLoopResult.
    expect(result.error).toContain('LLM calls blocked');
    expect(result.text).toBe('');
    expect(result.providerId).toBe('none');
  });

  it('returns a friendly error when the model preference cannot be resolved', async () => {
    const result = await agentLoop(
      [{ role: 'user', content: 'ping' }],
      tempRoot,
      'no-colon-here',
    );

    expect(result.error).toContain('Invalid model format');
    expect(result.text).toBe('');
    expect(result.providerId).toBe('none');
  });
});

describe('agentLoop with the mock-native (AI SDK streamText) provider', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-agent-loop-native-'));
    resetFakeModelState();
    process.env.FREECODE_FAKE_LLM = '1';
    delete process.env.FREECODE_NO_LLM;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    stdoutSpy.mockRestore();
    resetFakeModelState();
    if (previousFake === undefined) delete process.env.FREECODE_FAKE_LLM;
    else process.env.FREECODE_FAKE_LLM = previousFake;
    if (previousScript === undefined) delete process.env.FREECODE_FAKE_LLM_SCRIPT;
    else process.env.FREECODE_FAKE_LLM_SCRIPT = previousScript;
    if (previousNoLlm === undefined) delete process.env.FREECODE_NO_LLM;
    else process.env.FREECODE_NO_LLM = previousNoLlm;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('streams a text-only response through the real streamText path', async () => {
    writeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [{
        match: { turn: 1, provider: 'mock-native', mustContain: ['ping'], systemPromptPresent: true },
        response: { chunks: ['Pong ', 'native'], usage: { promptTokens: 4, outputTokens: 2, totalTokens: 6 } },
      }],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'ping' }],
      tempRoot,
      'mock-native:gpt-freecode-test',
    );

    expect(result.text).toBe('Pong native');
    expect(result.providerId).toBe('mock-native');
    expect(result.modelId).toBe('gpt-freecode-test');
  });

  it('drives a multi-step create tool call through streamText orchestration', async () => {
    writeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [
        {
          match: { turn: 1, nativeToolsSupplied: true },
          response: {
            chunks: ['Writing now.'],
            toolCalls: [{ name: 'create', args: { path: 'native.txt', content: 'ok\n' } }],
            usage: { promptTokens: 10, outputTokens: 4, totalTokens: 14 },
          },
        },
        {
          match: { turn: 2 },
          response: { chunks: ['Finished.'], usage: { promptTokens: 20, outputTokens: 2, totalTokens: 22 } },
        },
      ],
    });

    const steps: number[] = [];
    const result = await agentLoop(
      [{ role: 'user', content: 'create native.txt' }],
      tempRoot,
      'mock-native:gpt-freecode-test',
      { confirmToolCall: approve, onStepUsage: (info) => void steps.push(info.promptTokens) },
    );

    expect(result.text).toBe('Writing now.\nFinished.');
    expect(existsSync(join(tempRoot, 'native.txt'))).toBe(true);
    expect(readFileSync(join(tempRoot, 'native.txt'), 'utf-8')).toBe('ok\n');
    // Context size must be the LAST step's prompt tokens (20), NOT the SDK's
    // step-summed total (10 + 20 = 30). Summing here is the footer's old bug:
    // it would report ~step-count× the real context and can exceed the window.
    expect(result.usage.promptTokens).toBe(20);
    // The mid-turn ctx tick reads `event.usage` from onStepFinish, a DIFFERENT
    // source than the value above. Pin that it is per-step (10 then 20) and not
    // the same running total — a summed [10, 30] would make the footer climb
    // past the real context window while the turn is still going.
    expect(steps).toEqual([10, 20]);
  });

  it('recovers a tool call the SDK rejected and finishes the turn without replaying completed calls', async () => {
    writeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [
        {
          match: { turn: 1, nativeToolsSupplied: true },
          response: {
            chunks: ['Creating first.'],
            toolCalls: [{ name: 'create', args: { path: 'once.txt', content: 'first\n' } }],
            usage: { promptTokens: 10, outputTokens: 4, totalTokens: 14 },
          },
        },
        {
          match: { turn: 2 },
          response: {
            chunks: ['Now searching.'],
            // head_limit must be a number — the AI SDK rejects this before grep runs,
            // so it never produces a tool result and the SDK stops stepping.
            toolCalls: [{ name: 'grep', args: { pattern: 'first', head_limit: 'fifty' } }],
            usage: { promptTokens: 20, outputTokens: 4, totalTokens: 24 },
          },
        },
        {
          match: {
            turn: 3,
            mustContain: ['Your call to "grep" was rejected before it ran'],
          },
          response: { chunks: ['Recovered.'], usage: { promptTokens: 30, outputTokens: 2, totalTokens: 32 } },
        },
      ],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'create then search' }],
      tempRoot,
      'mock-native:gpt-freecode-test',
      { confirmToolCall: approve },
    );

    expect(result.text).toContain('Recovered.');
    // create uses flag 'wx'. The old recovery restarted from the ORIGINAL history, so
    // the model would have been asked to redo a call it had already completed; the
    // continuation keeps it in history instead, and the file still holds its first write.
    expect(readFileSync(join(tempRoot, 'once.txt'), 'utf-8')).toBe('first\n');
    // Usage is carried across the two streamText calls the turn now spans.
    expect(result.usage.totalTokens).toBe(14 + 24 + 32);
    expect(result.usage.promptTokens).toBe(30);
  });

  it('uses prompt-based tools when parsedTools is set on the model', async () => {
    // Asserts on visible output, so it opts out of the suite-wide
    // FREECODE_TRANSCRIPT_STREAM=null (vitest.config.ts) that keeps every other test
    // quiet — writeTranscriptText honours that setting.
    vi.stubEnv('FREECODE_TRANSCRIPT_STREAM', 'stdout');
    setModelSetting('mock-native:gpt-freecode-test', 'parsedTools', true);
    writeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [{
        match: { turn: 1, nativeToolsSupplied: false },
        response: { chunks: ['Done via prompt tools.'], usage: { promptTokens: 5, outputTokens: 3, totalTokens: 8 } },
      }],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'ping' }],
      tempRoot,
      'mock-native:gpt-freecode-test',
    );

    const written = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(written).toContain('using prompt-based tools');
    expect(result.text).toContain('Done via prompt tools.');

    setModelSetting('mock-native:gpt-freecode-test', 'parsedTools', undefined);
  });
});
