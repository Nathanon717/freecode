// check-tests: orphan — extra test file for src/eval/runner.ts, kept separate to isolate vi.mock('fs') and vi.mock('child_process')
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { ChildProcess } from 'child_process';
import type * as FsModule from 'fs';
import type * as ChildProcessModule from 'child_process';

vi.mock('fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = await importOriginal<FsModule>();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return { ...actual, existsSync: vi.fn() };
});

vi.mock('child_process', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = await importOriginal<ChildProcessModule>();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return { ...actual, spawn: vi.fn(), spawnSync: vi.fn() };
});

import { existsSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { startEvalScenario, runCheckScript, type EvalRunResult } from '../../src/eval/runner.js';

// ───── helpers ─────────────────────────────────────────────────────────────

class FakeProcess extends EventEmitter {
  stdin = { end: vi.fn() };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn(() => { this.emit('close', null); });
}

function makeRunResult(over: Partial<EvalRunResult> = {}): EvalRunResult {
  return {
    exitCode: 0, stdout: '', stderr: '',
    toolCalls: [], tokens: { total: 0 }, workDir: '', quota: null,
    ...over,
  };
}

type SpawnCall = [cmd: string, args: string[], opts: { env: Record<string, string> }];

function getLastSpawnEnv(): Record<string, string> {
  const calls = vi.mocked(spawn).mock.calls;
  return (calls[0] as unknown as SpawnCall)[2].env;
}

// ───── startEvalScenario ───────────────────────────────────────────────────

describe('startEvalScenario', () => {
  let scenarioDir: string;
  let fakeProc: FakeProcess;
  let realExistsSync: (p: string) => boolean;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks(); // reset call history between tests so mock.calls[0] is always this test's call
    const actualFs = (await vi.importActual('fs')) as unknown as typeof FsModule;
    realExistsSync = (p) => actualFs.existsSync(p);
    // Default: real implementation so dist/index.js is found after build.
    vi.mocked(existsSync).mockImplementation((p) => realExistsSync(String(p)));

    scenarioDir = mkdtempSync(join(tmpdir(), 'freecode-runner-subprocess-'));
    mkdirSync(join(scenarioDir, 'work'), { recursive: true });

    fakeProc = new FakeProcess();
    vi.mocked(spawn).mockReturnValue(fakeProc as unknown as ChildProcess);

    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(scenarioDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('throws when dist/index.js is not found', () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p).endsWith('index.js')) return false;
      return realExistsSync(String(p));
    });
    expect(() => startEvalScenario(scenarioDir, 'hello')).toThrow(/dist\/index\.js not found/);
  });

  it('returns promise, cancel, retryStatusFile, resultFile', () => {
    const result = startEvalScenario(scenarioDir, 'hello');
    expect(result).toHaveProperty('promise');
    expect(result).toHaveProperty('cancel');
    expect(result).toHaveProperty('retryStatusFile');
    expect(result).toHaveProperty('resultFile');
    fakeProc.emit('close', 0); // resolve promise so we don't leak
  });

  it('resolves with exitCode 0 when process closes cleanly', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.exitCode).toBe(0);
    expect(result.toolCalls).toEqual([]);
    expect(result.tokens.total).toBe(0);
    expect(result.tokens.prompt).toBeUndefined();
    expect(result.tokens.output).toBeUndefined();
  });

  it('sets FREECODE_MODEL when model is provided', () => {
    startEvalScenario(scenarioDir, 'hello', 'openai:gpt-4o');
    fakeProc.emit('close', 0);
    expect(getLastSpawnEnv()['FREECODE_MODEL']).toBe('openai:gpt-4o');
  });

  it('omits FREECODE_MODEL when no model is provided', () => {
    startEvalScenario(scenarioDir, 'hello');
    fakeProc.emit('close', 0);
    expect(getLastSpawnEnv()['FREECODE_MODEL']).toBeUndefined();
  });

  it('writes stdout chunks to process.stdout line by line', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.stdout.emit('data', Buffer.from('line one\nline two\n'));
    fakeProc.emit('close', 0);
    await promise;
    expect(stdoutSpy).toHaveBeenCalledWith('line one\n');
    expect(stdoutSpy).toHaveBeenCalledWith('line two\n');
  });

  it('handles string stdout chunks in addition to Buffer', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.stdout.emit('data', 'string chunk\n');
    fakeProc.emit('close', 0);
    await promise;
    expect(stdoutSpy).toHaveBeenCalledWith('string chunk\n');
  });

  it('flushes partial line to stdout on close', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.stdout.emit('data', 'no newline here');
    fakeProc.emit('close', 0);
    await promise;
    expect(stdoutSpy).toHaveBeenCalledWith('no newline here');
  });

  it('collects all stdout chunks for the result', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.stdout.emit('data', 'part1');
    fakeProc.stdout.emit('data', 'part2\n');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.stdout).toBe('part1part2\n');
  });

  it('treats null close code as exit code 1', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.emit('close', null);
    const result = await promise;
    expect(result.exitCode).toBe(1);
  });

  it('writes stderr to process.stderr on non-zero exit', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.stderr.emit('data', Buffer.from('something went wrong'));
    fakeProc.emit('close', 1);
    await promise;
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('something went wrong'));
  });

  it('does not write to process.stderr when exit code is 0', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.stderr.emit('data', Buffer.from('ignore me'));
    fakeProc.emit('close', 0);
    await promise;
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does not write to process.stderr when stderr is only whitespace', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.stderr.emit('data', Buffer.from('   \n'));
    fakeProc.emit('close', 1);
    await promise;
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('reads tool calls from trace.json when it exists', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const traceFile = join(scenarioDir, '.run', 'trace.json');
    const traceData = [{ tool: 'read', args: { path: 'foo.ts' } }];
    writeFileSync(traceFile, JSON.stringify(traceData), 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.toolCalls).toEqual(traceData);
  });

  it('returns empty toolCalls when trace.json is malformed', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const traceFile = join(scenarioDir, '.run', 'trace.json');
    writeFileSync(traceFile, 'not json', 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.toolCalls).toEqual([]);
  });

  it('computes token totals from result.json', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const resultFile = join(scenarioDir, '.run', 'result.json');
    const agentResults = [
      { totalTokens: 100, promptTokens: 60, outputTokens: 40 },
      { totalTokens: 200, promptTokens: 120, outputTokens: 80 },
    ];
    writeFileSync(resultFile, JSON.stringify(agentResults), 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.tokens.total).toBe(300);
    expect(result.tokens.prompt).toBe(180);
    expect(result.tokens.output).toBe(120);
  });

  it('omits prompt/output tokens when not present in result.json', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const resultFile = join(scenarioDir, '.run', 'result.json');
    writeFileSync(resultFile, JSON.stringify([{ totalTokens: 50 }]), 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.tokens.total).toBe(50);
    expect(result.tokens.prompt).toBeUndefined();
    expect(result.tokens.output).toBeUndefined();
  });

  it('returns zero tokens when result.json is malformed', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const resultFile = join(scenarioDir, '.run', 'result.json');
    writeFileSync(resultFile, 'bad json', 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.tokens.total).toBe(0);
  });

  it('treats missing totalTokens as 0 in token sum', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const resultFile = join(scenarioDir, '.run', 'result.json');
    writeFileSync(resultFile, JSON.stringify([
      { totalTokens: 10 },
      { promptTokens: 5 }, // no totalTokens → ?? 0 branch
    ]), 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.tokens.total).toBe(10);
  });

  it('pads missing promptTokens/outputTokens with 0 when other entries have them', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const resultFile = join(scenarioDir, '.run', 'result.json');
    writeFileSync(resultFile, JSON.stringify([
      { totalTokens: 10, promptTokens: 6, outputTokens: 4 },
      { totalTokens: 20 }, // no promptTokens/outputTokens → ?? 0 branches
    ]), 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.tokens.prompt).toBe(6);
    expect(result.tokens.output).toBe(4);
  });

  it('extracts quota from the last result entry that has one', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    const resultFile = join(scenarioDir, '.run', 'result.json');
    const agentResults = [
      { totalTokens: 10, quota: { limit: 100 } },
      { totalTokens: 20, quota: { limit: 200 } },
    ];
    writeFileSync(resultFile, JSON.stringify(agentResults), 'utf-8');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.quota).toEqual({ limit: 200 });
  });

  it('cancel() kills the process', async () => {
    const { promise, cancel } = startEvalScenario(scenarioDir, 'hello');
    cancel();
    await promise; // kill() → emits close(null) → resolves with exitCode 1
    expect(fakeProc.kill).toHaveBeenCalled();
  });

  it('includes workDir in the resolved result', async () => {
    const { promise } = startEvalScenario(scenarioDir, 'hello');
    fakeProc.emit('close', 0);
    const result = await promise;
    expect(result.workDir).toBe(join(scenarioDir, 'work'));
  });

  it('respects maxToolCalls from eval.config.json via spawn env', () => {
    writeFileSync(join(scenarioDir, 'eval.config.json'), JSON.stringify({ maxToolCalls: 5 }));
    startEvalScenario(scenarioDir, 'hello');
    fakeProc.emit('close', 0);
    expect(getLastSpawnEnv()['FREECODE_MAX_TOOL_CALLS']).toBe('5');
  });
});

// ───── runCheckScript ──────────────────────────────────────────────────────

type SpawnSyncResult = ReturnType<typeof spawnSync>;

function fakeSpawnSync(over: Partial<SpawnSyncResult>): SpawnSyncResult {
  return {
    pid: 1, output: [], status: 0, signal: null,
    error: undefined, stdout: '', stderr: '',
    ...over,
  };
}

describe('runCheckScript', () => {
  let scenarioDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const actualFs = (await vi.importActual('fs')) as unknown as typeof FsModule;
    vi.mocked(existsSync).mockImplementation((p) => actualFs.existsSync(p));
    scenarioDir = mkdtempSync(join(tmpdir(), 'freecode-runner-check-'));
    mkdirSync(join(scenarioDir, '.run'), { recursive: true });
  });

  afterEach(() => {
    rmSync(scenarioDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns parsed EvalReport on success', () => {
    const report = { scenarioId: 'my-scenario', checks: [{ name: 'c1', passed: true, message: 'ok' }] };
    vi.mocked(spawnSync).mockReturnValue(fakeSpawnSync({ stdout: JSON.stringify(report) }));

    const result = runCheckScript('my-scenario', scenarioDir, makeRunResult());
    expect(result).toEqual(report);
  });

  it('writes result-input.json before running the check script', () => {
    const runResult = makeRunResult({ exitCode: 42 });
    vi.mocked(spawnSync).mockReturnValue(
      fakeSpawnSync({ stdout: JSON.stringify({ scenarioId: 'x', checks: [] }) }),
    );

    runCheckScript('x', scenarioDir, runResult);
    const written = join(scenarioDir, '.run', 'result-input.json');
    expect(existsSync(written)).toBe(true);
  });

  it('throws when checkProc.error is set, using the error message as detail', () => {
    vi.mocked(spawnSync).mockReturnValue(fakeSpawnSync({ error: new Error('spawn ENOENT'), stdout: '' }));

    expect(() => runCheckScript('my-scenario', scenarioDir, makeRunResult()))
      .toThrow(/spawn ENOENT/);
  });

  it('throws when stdout is empty/whitespace', () => {
    vi.mocked(spawnSync).mockReturnValue(fakeSpawnSync({ stdout: '   ' }));

    expect(() => runCheckScript('my-scenario', scenarioDir, makeRunResult()))
      .toThrow(/check script failed/);
  });

  it('includes stderr in the error detail', () => {
    vi.mocked(spawnSync).mockReturnValue(fakeSpawnSync({ stdout: '', stderr: 'SyntaxError: bad' }));

    expect(() => runCheckScript('my-scenario', scenarioDir, makeRunResult()))
      .toThrow(/SyntaxError/);
  });

  it('includes exit status in the error detail when stdout is empty and stderr is null', () => {
    // When stderr is null (not empty string), checkProc.stderr?.trim() is undefined,
    // so the ?? chain falls through to `exit ${status}`.
    vi.mocked(spawnSync).mockReturnValue(fakeSpawnSync({ stdout: '', stderr: null as unknown as string, status: 2 }));

    expect(() => runCheckScript('my-scenario', scenarioDir, makeRunResult()))
      .toThrow(/exit 2/);
  });
});
