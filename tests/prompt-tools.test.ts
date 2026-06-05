import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPromptToolsSystemPrompt, parseToolCalls, runPromptToolsLoop } from '../src/agent/prompt-tools.js';
import { createFakeNativeLanguageModel, resetFakeModelState } from '../src/providers/fake.js';
import { setProjectRoot } from '../src/agent/context.js';

describe('prompt-based tool prompt', () => {
  it('documents grep include glob with the actual tool argument name', () => {
    const prompt = buildPromptToolsSystemPrompt('base');

    expect(prompt).toContain('"include"?: string');
    expect(prompt).not.toContain('file_glob');
  });
});

describe('parseToolCalls', () => {
  it('returns nothing for plain text with no tool blocks', () => {
    expect(parseToolCalls('just a normal answer')).toEqual([]);
  });

  it('parses a single tool call with args', () => {
    const text = '<tool_call>\n{"name": "read_file", "args": {"path": "a.txt"}}\n</tool_call>';
    const calls = parseToolCalls(text);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('read_file');
    expect(calls[0].args).toEqual({ path: 'a.txt' });
    expect(calls[0].startIdx).toBe(0);
  });

  it('parses multiple tool calls in order', () => {
    const text =
      'first <tool_call>{"name": "list_dir", "args": {}}</tool_call>' +
      ' then <tool_call>{"name": "grep", "args": {"pattern": "x"}}</tool_call>';
    const calls = parseToolCalls(text);
    expect(calls.map(c => c.name)).toEqual(['list_dir', 'grep']);
  });

  it('defaults args to an empty object when omitted', () => {
    const calls = parseToolCalls('<tool_call>{"name": "list_dir"}</tool_call>');
    expect(calls[0].args).toEqual({});
  });

  it('skips malformed JSON blocks without throwing', () => {
    const calls = parseToolCalls('<tool_call>{not json}</tool_call>');
    expect(calls).toEqual([]);
  });

  it('ignores blocks whose payload lacks a string name', () => {
    const calls = parseToolCalls('<tool_call>{"args": {"path": "a"}}</tool_call>');
    expect(calls).toEqual([]);
  });
});

describe('runPromptToolsLoop', () => {
  const previousScript = process.env.FREECODE_FAKE_LLM_SCRIPT;
  let tempRoot = '';
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-prompt-tools-'));
    resetFakeModelState();
    delete process.env.FREECODE_FAKE_LLM_TRACE;
    setProjectRoot(tempRoot);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    resetFakeModelState();
    setProjectRoot(process.cwd());
    if (previousScript === undefined) delete process.env.FREECODE_FAKE_LLM_SCRIPT;
    else process.env.FREECODE_FAKE_LLM_SCRIPT = previousScript;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function writeFixture(value: unknown): void {
    const fixturePath = join(tempRoot, 'fixture.llm.json');
    writeFileSync(fixturePath, JSON.stringify(value, null, 2), 'utf-8');
    process.env.FREECODE_FAKE_LLM_SCRIPT = fixturePath;
  }

  it('executes a text-based tool call then returns the final answer', async () => {
    writeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [
        {
          response: {
            chunks: ['<tool_call>\n{"name": "write_file", "args": {"path": "pt.txt", "content": "hi\\n"}}\n</tool_call>'],
            usage: { promptTokens: 8, outputTokens: 4, totalTokens: 12 },
          },
        },
        {
          response: { chunks: ['The file is written.'], usage: { promptTokens: 15, outputTokens: 3, totalTokens: 18 } },
        },
      ],
    });

    const model = createFakeNativeLanguageModel('gpt-freecode-test', { toolRationale: false, parallelTools: false });
    const result = await runPromptToolsLoop(
      [{ role: 'user', content: 'write pt.txt' }],
      'base system prompt',
      model,
      () => Promise.resolve(true),
      false,
    );

    expect(result.text).toContain('The file is written.');
    expect(result.totalTokens).toBe(30);
    expect(existsSync(join(tempRoot, 'pt.txt'))).toBe(true);
    expect(readFileSync(join(tempRoot, 'pt.txt'), 'utf-8')).toBe('hi\n');
  });

  it('feeds an unknown-tool error back to the model and continues', async () => {
    writeFixture({
      version: 1,
      model: 'mock-native:gpt-freecode-test',
      steps: [
        { response: { chunks: ['<tool_call>{"name": "bogus_tool", "args": {}}</tool_call>'] } },
        { response: { chunks: ['Done without it.'] } },
      ],
    });

    const model = createFakeNativeLanguageModel('gpt-freecode-test', { toolRationale: false, parallelTools: false });
    const result = await runPromptToolsLoop(
      [{ role: 'user', content: 'go' }],
      'base',
      model,
      () => Promise.resolve(true),
      false,
    );

    expect(result.text).toContain('Done without it.');
    const printed = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(printed).toContain('Unknown tool');
  });
});
