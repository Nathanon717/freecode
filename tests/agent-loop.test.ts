import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentLoop } from '../src/agent/loop.js';
import { resetFakeModelState } from '../src/providers/fake.js';
import { UserAbortError } from '../src/util/errors.js';

const previousFake = process.env.FREECODE_FAKE_LLM;
const previousScript = process.env.FREECODE_FAKE_LLM_SCRIPT;
const previousNoLlm = process.env.FREECODE_NO_LLM;

let tempRoot = '';
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function writeFixture(value: unknown): void {
  const fixturePath = join(tempRoot, 'fixture.llm.json');
  writeFileSync(fixturePath, JSON.stringify(value, null, 2), 'utf-8');
  process.env.FREECODE_FAKE_LLM_SCRIPT = fixturePath;
}

const approve = () => Promise.resolve(true);

describe('agentLoop with the mock fake-direct provider', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-agent-loop-'));
    resetFakeModelState();
    process.env.FREECODE_FAKE_LLM = '1';
    delete process.env.FREECODE_NO_LLM;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
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

  it('returns a text-only response with provider, model, and usage', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [{
        match: { turn: 1, provider: 'mock', mustContain: ['ping'], systemPromptPresent: true },
        response: { chunks: ['Hello ', 'there'], usage: { promptTokens: 3, outputTokens: 2, totalTokens: 5 } },
      }],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'ping' }],
      tempRoot,
      'mock:gpt-freecode-test',
    );

    expect(result.text).toBe('Hello there');
    expect(result.providerId).toBe('mock');
    expect(result.modelId).toBe('gpt-freecode-test');
    expect(result.usage).toEqual({ totalTokens: 5, promptTokens: 3, outputTokens: 2 });
  });

  it('drives an approved write_file tool call and then ends on a text step', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [
        {
          match: { turn: 1, toolsAvailable: ['write_file'] },
          response: {
            chunks: ['Writing the file.'],
            toolCalls: [{ name: 'write_file', args: { path: 'note.txt', content: 'persisted\n' } }],
            usage: { promptTokens: 10, outputTokens: 4, totalTokens: 14 },
          },
        },
        {
          match: { turn: 2 },
          response: { chunks: ['All done.'], usage: { promptTokens: 20, outputTokens: 2, totalTokens: 22 } },
        },
      ],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'create note.txt' }],
      tempRoot,
      'mock:gpt-freecode-test',
      { confirmToolCall: approve },
    );

    expect(result.text).toBe('Writing the file.All done.');
    expect(result.usage.totalTokens).toBe(36);
    expect(existsSync(join(tempRoot, 'note.txt'))).toBe(true);
    expect(readFileSync(join(tempRoot, 'note.txt'), 'utf-8')).toBe('persisted\n');
  });

  it('feeds a denial result back to the model when a tool call is rejected', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [
        {
          response: {
            chunks: ['Trying to write.'],
            toolCalls: [{ name: 'write_file', args: { path: 'blocked.txt', content: 'nope' } }],
          },
        },
        { response: { chunks: ['Understood, stopping.'] } },
      ],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'write a file' }],
      tempRoot,
      'mock:gpt-freecode-test',
      { confirmToolCall: () => Promise.resolve(false) },
    );

    expect(result.text).toBe('Trying to write.Understood, stopping.');
    expect(existsSync(join(tempRoot, 'blocked.txt'))).toBe(false);
  });

  it('reports an unknown tool back to the model and keeps going', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [
        {
          response: {
            chunks: ['Calling a bogus tool.'],
            toolCalls: [{ name: 'does_not_exist', args: {} }],
          },
        },
        { response: { chunks: ['Recovered.'] } },
      ],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'do something' }],
      tempRoot,
      'mock:gpt-freecode-test',
      { confirmToolCall: approve },
    );

    expect(result.text).toBe('Calling a bogus tool.Recovered.');
  });

  it('errors when the model emits tool calls but the model does not support tools', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test-no-tools',
      steps: [{
        response: {
          chunks: ['I will use a tool.'],
          toolCalls: [{ name: 'write_file', args: { path: 'x.txt', content: 'y' } }],
        },
      }],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'go' }],
      tempRoot,
      'mock:gpt-freecode-test-no-tools',
      { confirmToolCall: approve },
    );

    expect(result.text).toContain('does not support tools');
  });

  it('surfaces a fixture error response as an error result', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [{ response: { error: 'provider exploded' } }],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'go' }],
      tempRoot,
      'mock:gpt-freecode-test',
    );

    expect(result.text).toContain('Error: provider exploded');
  });

  it('preserves partial text and stops cleanly when the user aborts a tool call', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      allowUnusedSteps: true,
      steps: [
        {
          response: {
            chunks: ['Thinking. '],
            toolCalls: [{ name: 'write_file', args: { path: 'a.txt', content: 'b' } }],
          },
        },
        { response: { chunks: ['unreached'] } },
      ],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'go' }],
      tempRoot,
      'mock:gpt-freecode-test',
      { confirmToolCall: () => { throw new UserAbortError(); } },
    );

    expect(result.text).toBe('Thinking. ');
    expect(existsSync(join(tempRoot, 'a.txt'))).toBe(false);
  });

  it('blocks all LLM access when FREECODE_NO_LLM=1', async () => {
    process.env.FREECODE_NO_LLM = '1';

    const result = await agentLoop(
      [{ role: 'user', content: 'ping' }],
      tempRoot,
      'mock:gpt-freecode-test',
    );

    expect(result.text).toContain('LLM calls blocked');
    expect(result.providerId).toBe('none');
  });

  it('returns a friendly error when the model preference cannot be resolved', async () => {
    const result = await agentLoop(
      [{ role: 'user', content: 'ping' }],
      tempRoot,
      'no-colon-here',
    );

    expect(result.text).toContain('Error:');
    expect(result.text).toContain('Invalid model format');
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

  it('drives a multi-step write_file tool call through streamText orchestration', async () => {
    writeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [
        {
          match: { turn: 1, nativeToolsSupplied: true },
          response: {
            chunks: ['Writing now.'],
            toolCalls: [{ name: 'write_file', args: { path: 'native.txt', content: 'ok\n' } }],
            usage: { promptTokens: 10, outputTokens: 4, totalTokens: 14 },
          },
        },
        {
          match: { turn: 2 },
          response: { chunks: ['Finished.'], usage: { promptTokens: 20, outputTokens: 2, totalTokens: 22 } },
        },
      ],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'create native.txt' }],
      tempRoot,
      'mock-native:gpt-freecode-test',
      { confirmToolCall: approve },
    );

    expect(result.text).toBe('Writing now.Finished.');
    expect(existsSync(join(tempRoot, 'native.txt'))).toBe(true);
    expect(readFileSync(join(tempRoot, 'native.txt'), 'utf-8')).toBe('ok\n');
  });
});
