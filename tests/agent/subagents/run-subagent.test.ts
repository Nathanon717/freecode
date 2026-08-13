import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

  // Finding D14. A sub-agent gets READ_ONLY_TOOL_DEFS *raw* — no withSnapshotGate,
  // no withConfirmation, no transcript rendering (see the header of
  // run-subagent.ts). That is sound only for as long as the set it reaches for
  // stays read-only: a write tool added to READ_ONLY_TOOL_DEFS, or this function
  // switching to a wider source, would produce unconfirmed, unsnapshotted,
  // invisible writes — invisible because `checkpoint diff` needs a snapshot the
  // gate never took. So pin the names the sub-turn is actually handed, not the
  // persona: AgentPersona carries no tool field, and no persona edit can widen it.
  it('hands the sub-turn the read-only tools and nothing else', async () => {
    const tracePath = join(tempRoot, 'trace.json');
    process.env.FREECODE_FAKE_LLM_TRACE = tracePath;
    writeFixture({ version: 1, steps: [{ response: { text: 'done', usage: { totalTokens: 1 } } }] });

    try {
      await runSubAgent('explore', 'anything', fakeCtx);
    } finally {
      delete process.env.FREECODE_FAKE_LLM_TRACE;
    }

    const trace = JSON.parse(readFileSync(tracePath, 'utf-8')) as Array<{ toolNames: string[] }>;
    const offered = trace[0].toolNames;
    const { READ_ONLY_TOOL_DEFS, WRITE_TOOL_DEFS } = await import('../../../src/agent/tools/index.js');
    expect([...offered].sort()).toEqual([...Object.keys(READ_ONLY_TOOL_DEFS)].sort());
    expect(offered.filter(name => name in WRITE_TOOL_DEFS)).toEqual([]);
    // Read-only is the property under test; naming the write tools makes a
    // failure say which one arrived.
    expect(offered).not.toContain('create');
    expect(offered).not.toContain('edit');
    expect(offered).not.toContain('shell_exec');
    // No recursion either: a sub-agent that could spawn is a budget nobody watches.
    expect(offered).not.toContain('spawn_agent');
  });
});
