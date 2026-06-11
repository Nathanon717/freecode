import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertFakeFixtureComplete,
  createFakeNativeLanguageModel,
  resetFakeModelState,
  runFakeModel,
} from '../../src/providers/fake.js';
import { streamText, tool } from 'ai';
import { z } from 'zod';

const previousScript = process.env.FREECODE_FAKE_LLM_SCRIPT;
const previousTrace = process.env.FREECODE_FAKE_LLM_TRACE;

let tempRoot = '';
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function writeFixture(value: unknown): string {
  const fixturePath = join(tempRoot, 'fixture.llm.json');
  writeFileSync(fixturePath, JSON.stringify(value, null, 2), 'utf-8');
  process.env.FREECODE_FAKE_LLM_SCRIPT = fixturePath;
  return fixturePath;
}

describe('fake LLM fixture runner', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-fake-provider-'));
    resetFakeModelState();
    delete process.env.FREECODE_FAKE_LLM_TRACE;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    resetFakeModelState();
    if (previousScript === undefined) delete process.env.FREECODE_FAKE_LLM_SCRIPT;
    else process.env.FREECODE_FAKE_LLM_SCRIPT = previousScript;
    if (previousTrace === undefined) delete process.env.FREECODE_FAKE_LLM_TRACE;
    else process.env.FREECODE_FAKE_LLM_TRACE = previousTrace;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('streams chunks, tool calls, usage, and trace entries in order', async () => {
    const tracePath = join(tempRoot, 'trace.json');
    process.env.FREECODE_FAKE_LLM_TRACE = tracePath;
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [{
        match: {
          turn: 1,
          provider: 'mock',
          model: 'gpt-freecode-test',
          mustContain: ['create a file'],
          toolsAvailable: ['create'],
          systemPromptPresent: true,
          messageCount: 1,
          toolRationale: true,
          parallelTools: false,
          nativeToolsSupplied: true,
        },
        response: {
          chunks: ['writing'],
          toolCalls: [{ name: 'create', args: { path: 'note.txt', content: 'ok' } }],
          usage: { promptTokens: 4, outputTokens: 2, totalTokens: 6 },
        },
      }],
    });

    const result = await runFakeModel({
      providerId: 'mock',
      modelId: 'gpt-freecode-test',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'please create a file' }],
      toolNames: ['create'],
      toolRationale: true,
      parallelTools: false,
      nativeToolsSupplied: true,
    });

    expect(result.text).toBe('writing');
    expect(result.toolCalls).toEqual([{ name: 'create', args: { path: 'note.txt', content: 'ok' } }]);
    expect(result.usage).toEqual({ promptTokens: 4, outputTokens: 2, totalTokens: 6 });
    expect(JSON.parse(readFileSync(tracePath, 'utf-8'))).toMatchObject([{
      callIndex: 1,
      executionPath: 'fake-direct',
      inputMessageCount: 1,
      toolRationale: true,
      parallelTools: false,
      nativeToolsSupplied: true,
      emittedChunks: ['writing'],
      emittedToolCalls: [{ name: 'create' }],
    }]);
  });

  it('fails on unused fixture steps unless explicitly allowed', async () => {
    writeFixture({
      version: 1,
      steps: [
        { response: { text: 'done' } },
        { response: { text: 'unused' } },
      ],
    });

    await runFakeModel({
      providerId: 'mock',
      modelId: 'gpt-freecode-test',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      toolNames: [],
      toolRationale: true,
      parallelTools: true,
      nativeToolsSupplied: false,
    });

    expect(() => assertFakeFixtureComplete()).toThrow('unused step');
  });

  it('rejects malformed tool calls while loading the fixture', async () => {
    writeFixture({
      version: 1,
      steps: [{
        response: {
          toolCalls: [{ args: { path: 'note.txt' } }],
        },
      }],
    });

    await expect(runFakeModel({
      providerId: 'mock',
      modelId: 'gpt-freecode-test',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'hello' }],
      toolNames: ['create'],
      toolRationale: true,
      parallelTools: true,
      nativeToolsSupplied: true,
    })).rejects.toThrow('toolCalls[0].name must be a non-empty string');
  });
});

describe('createFakeNativeLanguageModel', () => {
  let tempRoot2 = '';

  beforeEach(() => {
    tempRoot2 = mkdtempSync(join(tmpdir(), 'freecode-fake-native-'));
    resetFakeModelState();
    delete process.env.FREECODE_FAKE_LLM_TRACE;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    resetFakeModelState();
    if (previousScript === undefined) delete process.env.FREECODE_FAKE_LLM_SCRIPT;
    else process.env.FREECODE_FAKE_LLM_SCRIPT = previousScript;
    if (previousTrace === undefined) delete process.env.FREECODE_FAKE_LLM_TRACE;
    else process.env.FREECODE_FAKE_LLM_TRACE = previousTrace;
    rmSync(tempRoot2, { recursive: true, force: true });
  });

  function writeNativeFixture(value: unknown): void {
    const fixturePath = join(tempRoot2, 'fixture.llm.json');
    writeFileSync(fixturePath, JSON.stringify(value, null, 2), 'utf-8');
    process.env.FREECODE_FAKE_LLM_SCRIPT = fixturePath;
  }

  it('streams text through the real AI SDK streamText path and writes a native-stream trace', async () => {
    const tracePath = join(tempRoot2, 'trace.json');
    process.env.FREECODE_FAKE_LLM_TRACE = tracePath;
    writeNativeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [{
        match: {
          turn: 1,
          provider: 'mock-native',
          model: 'gpt-freecode-test',
          mustContain: ['hello'],
          systemPromptPresent: true,
        },
        response: {
          text: 'PONG',
          usage: { promptTokens: 5, outputTokens: 2, totalTokens: 7 },
        },
      }],
    });

    const model = createFakeNativeLanguageModel('gpt-freecode-test', { toolRationale: false, parallelTools: false });
    let fullText = '';
    const result = await streamText({
      model,
      system: 'you are a test assistant',
      messages: [{ role: 'user', content: 'say hello' }],
    });
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    expect(fullText).toBe('PONG');
    assertFakeFixtureComplete();
    const trace = JSON.parse(readFileSync(tracePath, 'utf-8'));
    expect(trace).toMatchObject([{
      callIndex: 1,
      providerId: 'mock-native',
      modelId: 'gpt-freecode-test',
      executionPath: 'native-stream',
      emittedChunks: ['PONG'],
    }]);
  });

  it('drives a multi-step tool call through streamText and writes two native-stream trace entries', async () => {
    const tracePath = join(tempRoot2, 'trace.json');
    process.env.FREECODE_FAKE_LLM_TRACE = tracePath;

    let toolCallCount = 0;

    writeNativeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [
        {
          match: { turn: 1, provider: 'mock-native', model: 'gpt-freecode-test', nativeToolsSupplied: true },
          response: {
            chunks: ['Using tool now.'],
            toolCalls: [{ name: 'create', args: { path: 'test.txt', content: 'hello\n' } }],
            usage: { promptTokens: 10, outputTokens: 4, totalTokens: 14 },
          },
        },
        {
          match: { turn: 2, provider: 'mock-native', model: 'gpt-freecode-test', nativeToolsSupplied: true },
          response: {
            text: 'Done.',
            usage: { promptTokens: 20, outputTokens: 2, totalTokens: 22 },
          },
        },
      ],
    });

    const writeTool = tool({
      description: 'write a file',
      parameters: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        toolCallCount++;
        return `wrote ${path}: ${content.length} bytes`;
      },
    });

    const model = createFakeNativeLanguageModel('gpt-freecode-test', { toolRationale: false, parallelTools: true });
    let fullText = '';
    const result = await streamText({
      model,
      system: 'you are a test assistant',
      messages: [{ role: 'user', content: 'write a file' }],
      tools: { create: writeTool },
      maxSteps: 5,
    });
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    expect(fullText).toBe('Using tool now.Done.');
    expect(toolCallCount).toBe(1);
    assertFakeFixtureComplete();

    const trace = JSON.parse(readFileSync(tracePath, 'utf-8'));
    expect(trace).toHaveLength(2);
    expect(trace[0]).toMatchObject({
      callIndex: 1,
      providerId: 'mock-native',
      modelId: 'gpt-freecode-test',
      executionPath: 'native-stream',
      nativeToolsSupplied: true,
      emittedChunks: ['Using tool now.'],
      emittedToolCalls: [{ name: 'create' }],
      usage: { promptTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
    expect(trace[1]).toMatchObject({
      callIndex: 2,
      providerId: 'mock-native',
      modelId: 'gpt-freecode-test',
      executionPath: 'native-stream',
      nativeToolsSupplied: true,
      emittedChunks: ['Done.'],
      emittedToolCalls: [],
      usage: { promptTokens: 20, outputTokens: 2, totalTokens: 22 },
    });
  });
});
