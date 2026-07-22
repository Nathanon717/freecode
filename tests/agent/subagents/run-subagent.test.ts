import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { runSubAgent } from '../../../src/agent/subagents/run-subagent.js';
import { resetFakeModelState } from '../../../src/providers/fake.js';

const previousFake = process.env.FREECODE_FAKE_LLM;
const previousScript = process.env.FREECODE_FAKE_LLM_SCRIPT;

let tempRoot = '';
let stdoutSpy: MockInstance;

function writeFixture(value: unknown): void {
  const fixturePath = join(tempRoot, 'fixture.llm.json');
  writeFileSync(fixturePath, JSON.stringify(value, null, 2), 'utf-8');
  process.env.FREECODE_FAKE_LLM_SCRIPT = fixturePath;
}

const fakeCtx = {
  kind: 'fake' as const,
  providerId: 'mock',
  modelId: 'gpt-freecode-test',
  toolRationale: false,
  parallelTools: true,
};

describe('runSubAgent', () => {
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'freecode-subagent-'));
    resetFakeModelState();
    process.env.FREECODE_FAKE_LLM = '1';
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    resetFakeModelState();
    if (previousFake === undefined) delete process.env.FREECODE_FAKE_LLM;
    else process.env.FREECODE_FAKE_LLM = previousFake;
    if (previousScript === undefined) delete process.env.FREECODE_FAKE_LLM_SCRIPT;
    else process.env.FREECODE_FAKE_LLM_SCRIPT = previousScript;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns an error string for an unknown agent type without calling the model', async () => {
    const result = await runSubAgent('does-not-exist', 'go', fakeCtx);
    expect(result).toContain('unknown agent type');
    expect(result).toContain('does-not-exist');
  });

  it('runs the fake sub-turn loop and returns the sub-agent final text', async () => {
    writeFixture({
      version: 1,
      steps: [{ response: { text: 'loadConfig — src/config/index.ts:1 [V]', usage: { totalTokens: 8 } } }],
    });

    const result = await runSubAgent('explore', 'Find where config is loaded.', fakeCtx);

    expect(result).toBe('loadConfig — src/config/index.ts:1 [V]');
  });
});
