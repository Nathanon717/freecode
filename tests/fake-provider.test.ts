import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertFakeFixtureComplete,
  resetFakeModelState,
  runFakeModel,
} from '../src/providers/fake.js';

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
          toolsAvailable: ['write_file'],
          systemPromptPresent: true,
          messageCount: 1,
          toolRationale: true,
          parallelTools: false,
          nativeToolsSupplied: true,
        },
        response: {
          chunks: ['writing'],
          toolCalls: [{ name: 'write_file', args: { path: 'note.txt', content: 'ok' } }],
          usage: { promptTokens: 4, outputTokens: 2, totalTokens: 6 },
        },
      }],
    });

    const result = await runFakeModel({
      providerId: 'mock',
      modelId: 'gpt-freecode-test',
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'please create a file' }],
      toolNames: ['write_file'],
      toolRationale: true,
      parallelTools: false,
      nativeToolsSupplied: true,
    });

    expect(result.text).toBe('writing');
    expect(result.toolCalls).toEqual([{ name: 'write_file', args: { path: 'note.txt', content: 'ok' } }]);
    expect(result.usage).toEqual({ promptTokens: 4, outputTokens: 2, totalTokens: 6 });
    expect(JSON.parse(readFileSync(tracePath, 'utf-8'))).toMatchObject([{
      callIndex: 1,
      executionPath: 'fake-direct',
      inputMessageCount: 1,
      toolRationale: true,
      parallelTools: false,
      nativeToolsSupplied: true,
      emittedChunks: ['writing'],
      emittedToolCalls: [{ name: 'write_file' }],
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
      toolNames: ['write_file'],
      toolRationale: true,
      parallelTools: true,
      nativeToolsSupplied: true,
    })).rejects.toThrow('toolCalls[0].name must be a non-empty string');
  });
});
