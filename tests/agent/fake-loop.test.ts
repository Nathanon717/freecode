import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { agentLoop } from '../../src/agent/loop.js';
import { resetFakeModelState } from '../../src/providers/fake.js';
import { UserAbortError } from '../../src/util/errors.js';

// runFakeLlm is reached through agentLoop's `mock:*` dispatch rather than imported
// directly, so these also pin that the fixture path is still wired up.

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

describe('runFakeLlm via agentLoop with the mock fake-direct provider', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-fake-loop-'));
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

  it('drives an approved create tool call and then ends on a text step', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [
        {
          match: { turn: 1, toolsAvailable: ['create'] },
          response: {
            chunks: ['Writing the file.'],
            toolCalls: [{ name: 'create', args: { path: 'note.txt', content: 'persisted\n' } }],
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

    expect(result.text).toBe('Writing the file.\nAll done.');
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
            toolCalls: [{ name: 'create', args: { path: 'blocked.txt', content: 'nope' } }],
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

    expect(result.text).toBe('Trying to write.\nUnderstood, stopping.');
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

    expect(result.text).toBe('Calling a bogus tool.\nRecovered.');
  });

  it('reports a failing tool back to the model as that call result and keeps going', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test',
      steps: [
        {
          response: {
            chunks: ['Editing.'],
            // edit on a file that was never read — the tool returns its own error string.
            toolCalls: [{ name: 'edit', args: { path: 'missing.txt', old_text: 'a', new_text: 'b' } }],
          },
        },
        { response: { chunks: ['Understood.'] } },
      ],
    });

    const result = await agentLoop(
      [{ role: 'user', content: 'edit missing.txt' }],
      tempRoot,
      'mock:gpt-freecode-test',
      { confirmToolCall: approve },
    );

    expect(result.text).toBe('Editing.\nUnderstood.');
  });

  it('errors when the model emits tool calls but the model does not support tools', async () => {
    writeFixture({
      version: 1,
      model: 'mock:gpt-freecode-test-no-tools',
      steps: [{
        response: {
          chunks: ['I will use a tool.'],
          toolCalls: [{ name: 'create', args: { path: 'x.txt', content: 'y' } }],
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
            toolCalls: [{ name: 'create', args: { path: 'a.txt', content: 'b' } }],
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
});
