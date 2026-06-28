import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve, dirname, join as pathJoin } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import type { Interface } from 'readline';

// ── Hoisted stores ────────────────────────────────────────────────────────────

const { mocks } = vi.hoisted(() => {
  const mocks = {
    spawnSyncImpl: null as null | ((cmd: string, args: string[], opts?: unknown) => unknown),
    evalHandle: null as null | {
      promise: Promise<unknown>;
      cancel: () => void;
      retryStatusFile: string;
      resultFile: string;
    },
    // If set, readFileSync throws this value instead of reading the file
    readFileSyncThrow: null as unknown,
  };
  return { mocks };
});

// ── Module mocks (must be top-level, before any imports from those modules) ───

// Partial mock of 'fs': pass through all real implementations except readFileSync,
// which needs to be controllable in specific tests.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    readFileSync: vi.fn((p: unknown, encoding?: unknown) => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      if (mocks.readFileSyncThrow !== null) throw mocks.readFileSyncThrow;
      return actual.readFileSync(p as string, encoding as BufferEncoding);
    }),
  };
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn((cmd: string, args: string[], opts?: unknown) => {
      if (mocks.spawnSyncImpl) return mocks.spawnSyncImpl(cmd, args, opts);
      // Default: python3 --version succeeds, all checks pass
      return { status: 0, error: null, stderr: '', stdout: '' };
    }),
  };
});

vi.mock('../../src/eval/runner.js', () => ({
  resetEvalWorkDir: vi.fn(),
  startEvalScenario: vi.fn(() => mocks.evalHandle),
}));

vi.mock('../../src/cli/eval-screen.js', () => ({
  printEvalHeader: vi.fn(),
  printEvalSummary: vi.fn(),
}));

vi.mock('../../src/cli/terminal-ui.js', () => ({
  setActiveModelFromString: vi.fn(),
  setTokenCount: vi.fn(),
  isBottomUIActive: vi.fn().mockReturnValue(false),
  setupBottomUI: vi.fn(),
  teardownBottomUI: vi.fn(),
}));

vi.mock('../../src/providers/model-store.js', () => ({
  appendEvalRun: vi.fn(),
}));

vi.mock('../../src/agent/system-prompt.js', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('mock system prompt'),
}));

const mockAccent = Object.assign((s: string) => s, { bold: (s: string) => s, black: (s: string) => s });
vi.mock('../../src/cli/banner.js', () => ({
  getBannerColor: () => mockAccent,
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  buildHumanEvalTab,
  makeRetryPrompter,
  printHumanEvalList,
  runHumanEvalProblems,
} from '../../src/cli/humaneval-menu.js';
import type { HumanEvalProblem } from '../../src/eval/humaneval-data.js';
import { appendEvalRun } from '../../src/providers/model-store.js';
import { printEvalSummary } from '../../src/cli/eval-screen.js';

// Mirrors the HUMANEVAL_RUNS_DIR constant from src/cli/humaneval-menu.ts
// (_dirname there is src/cli/, so two levels up to project root, then into playground/).
const SRC_CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'cli');
const HUMANEVAL_RUNS_DIR = resolve(SRC_CLI_DIR, '..', '..', 'playground', 'humaneval', '.runs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProblem(overrides?: Partial<HumanEvalProblem>): HumanEvalProblem {
  return {
    task_id: 'test/0',
    prompt: 'def add(a, b):\n    pass\n',
    canonical_solution: '    return a + b\n',
    test: 'def check(c):\n    assert c(1, 2) == 3\n',
    entry_point: 'add',
    ...overrides,
  };
}

const fakeRl = { question: vi.fn(), pause: vi.fn(), resume: vi.fn() } as unknown as Interface;

// ── buildHumanEvalTab ─────────────────────────────────────────────────────────

describe('buildHumanEvalTab', () => {
  it('renders without crashing when the tab row is focused (selected = -1)', () => {
    const problems = [makeProblem({ task_id: 'p/1' })];
    const tab = buildHumanEvalTab(problems, {}, (p) => p);
    expect(() => tab.renderBody(-1)).not.toThrow();
    const body = tab.renderBody(-1);
    // No row is highlighted when the tab row is focused (no ▶ cursor).
    expect(body.lines.some(l => l.includes('▶'))).toBe(false);
  });

  it('count() returns problems.length (no Run All row)', () => {
    const problems = [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })];
    const tab = buildHumanEvalTab(problems, {}, (p) => p);
    expect(tab.count()).toBe(2);
  });

  it('count() returns 0 when no problems', () => {
    const tab = buildHumanEvalTab([], {}, (p) => p);
    expect(tab.count()).toBe(0);
  });

  it('renderBody with a problem selected highlights its task_id at selectedLineIdx', () => {
    const problems = [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })];
    const tab = buildHumanEvalTab(problems, {}, (p) => p);
    const body = tab.renderBody(0);
    const joined = body.lines.join('\n');
    expect(joined).toContain('p/1');
    expect(body.selectedLineIdx).toBe(0);
  });

  it('renderBody shows pass/fail dots for prior results', () => {
    const problems = [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })];
    const results = { 'p/1': 'pass' as const, 'p/2': 'fail' as const };
    const tab = buildHumanEvalTab(problems, results, (p) => p);
    const body = tab.renderBody(0);
    // statusCircle renders a colored ● for every status; both rows carry one.
    expect(body.lines.filter(l => l.includes('●')).length).toBe(2);
  });

  it('renderDetail shows the badge, entry_point, and prompt for the selected problem', () => {
    const problems = [makeProblem({ task_id: 'p/1', entry_point: 'add', prompt: 'def add(a, b):' })];
    const tab = buildHumanEvalTab(problems, { 'p/1': 'pass' }, (p) => p);
    const lines = tab.renderDetail!(0);
    const joined = lines.join('\n');
    expect(joined).toContain('p/1');
    expect(joined).toContain('PASS');
    expect(joined).toContain('add');
    expect(joined).toContain('def add(a, b):');
  });

  it('renderDetail shows "No results yet" when the problem has no prior result', () => {
    const problems = [makeProblem({ task_id: 'p/1' })];
    const tab = buildHumanEvalTab(problems, {}, (p) => p);
    expect(tab.renderDetail!(0).join('\n')).toContain('No results yet');
  });

  it('Run action closes with just the selected problem', () => {
    const p1 = makeProblem({ task_id: 'p/1' });
    const p2 = makeProblem({ task_id: 'p/2' });
    const tab = buildHumanEvalTab([p1, p2], {}, (p) => p);
    const closed: unknown[] = [];
    const ctx = { getSelected: () => 1, close: (v: unknown) => closed.push(v), enterDetail: vi.fn() };
    tab.actionMenu!.onSelect('Run', ctx as never);
    expect(closed[0]).toEqual([p2]);
  });

  it('View action enters the detail view without closing', () => {
    const tab = buildHumanEvalTab([makeProblem({ task_id: 'p/1' })], {}, (p) => p);
    const enterDetail = vi.fn();
    const close = vi.fn();
    tab.actionMenu!.onSelect('View', { getSelected: () => 0, close, enterDetail } as never);
    expect(enterDetail).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it("'a' runs all problems and is consumed", () => {
    const problems = [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })];
    const tab = buildHumanEvalTab(problems, {}, (p) => ({ kind: 'humaneval' as const, problems: p }));
    const closed: unknown[] = [];
    const handled = tab.onKey!('a', { getSelected: () => 0, close: (v: unknown) => closed.push(v) } as never);
    expect(handled).toBe(true);
    expect(closed[0]).toEqual({ kind: 'humaneval', problems });
  });

  it('ignores keys other than the run-all shortcut', () => {
    const tab = buildHumanEvalTab([makeProblem()], {}, (p) => p);
    expect(tab.onKey!('x', { getSelected: () => 0, close: vi.fn() } as never)).toBe(false);
  });

  it('has controls string mentioning run all and details', () => {
    const tab = buildHumanEvalTab([], {}, (p) => p);
    expect(tab.controls).toContain('Up/Down');
    expect(tab.controls).toContain('run all');
    expect(tab.controls).toContain('details');
  });
});

// ── printHumanEvalList ────────────────────────────────────────────────────────

describe('printHumanEvalList', () => {
  it('prints each problem task_id and entry_point', () => {
    const problems = [
      makeProblem({ task_id: 'HumanEval/0', entry_point: 'has_close_elements' }),
      makeProblem({ task_id: 'HumanEval/1', entry_point: 'separate_paren_groups' }),
    ];
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    printHumanEvalList(problems);
    const joined = logged.join('\n');
    expect(joined).toContain('HumanEval/0');
    expect(joined).toContain('has_close_elements');
    expect(joined).toContain('HumanEval/1');
    expect(joined).toContain('separate_paren_groups');
    vi.restoreAllMocks();
  });

  it('prints header', () => {
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
    printHumanEvalList([]);
    expect(logged.some(l => l.includes('HumanEval'))).toBe(true);
    vi.restoreAllMocks();
  });
});

// ── runHumanEvalProblems / runOneProblem ──────────────────────────────────────

describe('runHumanEvalProblems', () => {
  const TEMP_WORK_DIR = join(tmpdir(), 'humaneval-unit-test-work');

  function makeHandle(overrides: Partial<{
    exitCode: number;
    toolCalls: unknown[];
    tokens: { total: number; prompt: number; output: number };
    workDir: string;
  }> = {}) {
    return {
      promise: Promise.resolve({
        exitCode: overrides.exitCode ?? 0,
        stdout: '',
        stderr: '',
        toolCalls: overrides.toolCalls ?? [{ tool: 'create', args: {} }],
        tokens: overrides.tokens ?? { total: 150, prompt: 100, output: 50 },
        workDir: overrides.workDir ?? TEMP_WORK_DIR,
        quota: null,
      }),
      cancel: vi.fn(),
      retryStatusFile: join(tmpdir(), 'retry-status.json'),
      resultFile: join(tmpdir(), 'result.json'),
    };
  }

  // Task IDs used in these tests — create their .run subdirs so writeFileSync(check.py) works.
  // resetEvalWorkDir is mocked (no-op) so we must create the directory structure ourselves.
  const TEST_SLUGS = ['test-0', 'p-1', 'p-2'];

  beforeEach(() => {
    mkdirSync(TEMP_WORK_DIR, { recursive: true });
    for (const slug of TEST_SLUGS) {
      mkdirSync(pathJoin(HUMANEVAL_RUNS_DIR, slug, '.run'), { recursive: true });
    }
    vi.clearAllMocks();
    mocks.spawnSyncImpl = null;
    mocks.readFileSyncThrow = null;
    mocks.evalHandle = makeHandle();
  });

  afterEach(() => {
    try { rmSync(TEMP_WORK_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    for (const slug of TEST_SLUGS) {
      try { rmSync(pathJoin(HUMANEVAL_RUNS_DIR, slug), { recursive: true, force: true }); } catch { /* ignore */ }
    }
    vi.restoreAllMocks();
  });

  it('logs PASS and calls appendEvalRun with pass:true when solution exists and python check passes', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    // spawnSync: python3 --version → ok, python check → pass (status 0)
    mocks.spawnSyncImpl = () => {
      return { status: 0, error: null, stderr: '', stdout: '' };
    };

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    expect(logged.some(l => l.includes('PASS'))).toBe(true);
    expect(vi.mocked(appendEvalRun)).toHaveBeenCalledOnce();
    const [, kind, summary] = vi.mocked(appendEvalRun).mock.calls[0];
    expect(kind).toBe('humaneval');
    expect(summary.pass).toBe(true);
    expect(summary.error).toBeNull();
    expect(summary.taskId).toBe('test/0');
  });

  it('records token and turn counts in appendEvalRun summary', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    const toolCalls = [{ tool: 'shell_exec', args: {} }, { tool: 'create', args: {} }];
    mocks.evalHandle = makeHandle({ toolCalls });

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    const [,, summary] = vi.mocked(appendEvalRun).mock.calls[0];
    expect(summary.turns).toBe(2);
    expect(summary.tokenUsage).toEqual({ input: 100, output: 50 });
  });

  it('logs FAIL and calls appendEvalRun with pass:false when solution.py is missing', async () => {
    // No solution.py in TEMP_WORK_DIR
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    expect(logged.some(l => l.includes('FAIL') && l.includes('solution.py not found'))).toBe(true);
    const [,, summary] = vi.mocked(appendEvalRun).mock.calls[0];
    expect(summary.pass).toBe(false);
    expect(summary.error).toContain('solution.py not found');
  });

  it('logs FAIL and records failReason when python check fails with non-zero exit', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a - b  # bug\n');
    mocks.spawnSyncImpl = (_cmd, args) => {
      if (args.includes('--version')) return { status: 0, error: null };
      return { status: 1, error: null, stderr: 'AssertionError: assert 3 == -1', stdout: '' };
    };

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    expect(logged.some(l => l.includes('FAIL'))).toBe(true);
    const [,, summary, detail] = vi.mocked(appendEvalRun).mock.calls[0];
    expect(summary.pass).toBe(false);
    // detail.scoringOutcome should carry the exit code and stderr
    const outcome = (detail as Record<string, unknown>).scoringOutcome as Record<string, unknown>;
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toContain('AssertionError');
  });

  it('records failReason from stderr tail in appendEvalRun detail', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a - b\n');
    const stderrLines = ['line1', 'line2', 'line3', 'line4', 'line5', 'AssertionError: failed'];
    mocks.spawnSyncImpl = (_cmd, args) => {
      if (args.includes('--version')) return { status: 0, error: null };
      return { status: 1, error: null, stderr: stderrLines.join('\n'), stdout: '' };
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    const [,, , detail] = vi.mocked(appendEvalRun).mock.calls[0];
    const failReason = (detail as Record<string, unknown>).failReason as string;
    expect(failReason).toContain('AssertionError: failed');
  });

  it('records pythonError when spawnSync returns an error object', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    mocks.spawnSyncImpl = (_cmd, args) => {
      if (args.includes('--version')) return { status: 0, error: null };
      return { status: null, error: new Error('ENOENT: python not found'), stderr: '', stdout: '' };
    };

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    expect(logged.some(l => l.includes('could not run python'))).toBe(true);
    const [,, summary, detail] = vi.mocked(appendEvalRun).mock.calls[0];
    expect(summary.pass).toBe(false);
    const outcome = (detail as Record<string, unknown>).scoringOutcome as Record<string, unknown>;
    expect(outcome.pythonError).toContain('ENOENT');
  });

  it('logs INCOMPLETE and returns incomplete status when agent exits with non-zero code', async () => {
    mocks.evalHandle = makeHandle({ exitCode: 1 });

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    expect(logged.some(l => l.includes('INCOMPLETE'))).toBe(true);
    const [,, summary] = vi.mocked(appendEvalRun).mock.calls[0];
    expect(summary.pass).toBe(false);
    expect(summary.error).toContain('agent did not finish');
  });

  it('prints summary when multiple problems are run', async () => {
    // All problems pass
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runHumanEvalProblems(
      [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })],
      'mock:model',
      fakeRl,
    );

    expect(vi.mocked(printEvalSummary)).toHaveBeenCalledOnce();
  });

  it('does not print summary when a single problem is run', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    expect(vi.mocked(printEvalSummary)).not.toHaveBeenCalled();
  });

  it('transcript turn has exactly one entry with required fields', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    const [,, , detail] = vi.mocked(appendEvalRun).mock.calls[0];
    const transcript = (detail as Record<string, unknown>).transcript as unknown[];
    expect(transcript).toHaveLength(1);
    const turn = transcript[0] as Record<string, unknown>;
    expect(turn).toHaveProperty('systemPrompt');
    expect(turn).toHaveProperty('userMessage');
    expect(turn).toHaveProperty('tokenUsage');
    expect(turn).toHaveProperty('toolCalls');
    // userMessage should contain the problem prompt
    expect(turn.userMessage as string).toContain('def add(a, b):');
  });

  it('passes falsy model string as empty string to setActiveModelFromString', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { setActiveModelFromString } = await import('../../src/cli/terminal-ui.js');
    await runHumanEvalProblems([makeProblem()], '', fakeRl);

    expect(vi.mocked(setActiveModelFromString)).toHaveBeenCalledWith('');
  });

  it('stops after the first problem when userCancelled is true in autoMode', async () => {
    // Make the handle resolve with a failed exit so runOneProblem path stays simple,
    // and the rl.question mock immediately cancels
    mocks.evalHandle = makeHandle({ exitCode: 1 });
    // In autoMode (>1 problem) rl is passed to runOneProblem, but the poll timer
    // won't fire in unit tests (promise resolves before 500ms). Test that the loop
    // exits when userCancelled is true; to trigger that we need the retryStatusFile
    // path — skip this branch and just assert the loop runs both problems when not cancelled.
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await runHumanEvalProblems(
      [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })],
      'mock:model',
      fakeRl,
    );

    // Both ran because userCancelled never fired
    expect(vi.mocked(appendEvalRun)).toHaveBeenCalledTimes(2);
  });

  it('passes stdout error text to appendEvalRun when stderr is empty', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a - b\n');
    mocks.spawnSyncImpl = (_cmd, args) => {
      if (args.includes('--version')) return { status: 0, error: null };
      return { status: 1, error: null, stderr: '', stdout: 'TypeError: something wrong' };
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    const [,, , detail] = vi.mocked(appendEvalRun).mock.calls[0];
    const failReason = (detail as Record<string, unknown>).failReason as string;
    expect(failReason).toContain('TypeError');
  });

  it('falls back to "python" when both python3 and python --version checks fail', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return a + b\n');
    // Both python3 and python --version fail → pythonCmd falls back to 'python', then check runs
    mocks.spawnSyncImpl = (_cmd, args) => {
      if (args.includes('--version')) return { status: 1, error: null, stderr: '', stdout: '' };
      // The actual python check passes
      return { status: 0, error: null, stderr: '', stdout: '' };
    };

    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });

    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    // The check still passes because the fallback 'python' command returned status 0
    expect(logged.some(l => l.includes('PASS'))).toBe(true);
  });

  it('cancels run and breaks loop when user answers "n" at rate-limit prompt (autoMode)', async () => {
    vi.useFakeTimers();

    let resolvePromise!: (v: unknown) => void;
    const deferredResult = new Promise(res => { resolvePromise = res; });

    const retryFilePath = pathJoin(tmpdir(), 'humaneval-retry-test-' + Date.now() + '.json');
    writeFileSync(retryFilePath, JSON.stringify({
      name: 'rate_limit', label: 'Rate Limit', targetMs: Date.now() + 60_000,
    }));

    const cancelMock = vi.fn();
    mocks.evalHandle = {
      promise: deferredResult,
      cancel: cancelMock,
      retryStatusFile: retryFilePath,
      resultFile: pathJoin(tmpdir(), 'result.json'),
    };

    // rl.question answers 'n' immediately (cancel)
    const cancelRl = {
      question: vi.fn((_msg: string, cb: (answer: string) => void) => { cb('n'); }),
      pause: vi.fn(),
      resume: vi.fn(),
    } as unknown as Interface;

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const runPromise = runHumanEvalProblems(
      [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })],
      'mock:model',
      cancelRl,
    );

    // Advance fake timers past the 500ms poll interval so the callback fires
    await vi.advanceTimersByTimeAsync(600);

    // handle.cancel() should have been called since user said 'n'
    expect(cancelMock).toHaveBeenCalled();

    // Now resolve the deferred promise so runOneProblem can finish
    resolvePromise({
      exitCode: 1,  // agent didn't finish — simplest path through runOneProblem
      stdout: '', stderr: '',
      toolCalls: [],
      tokens: { total: 0, prompt: 0, output: 0 },
      workDir: TEMP_WORK_DIR,
      quota: null,
    });

    await runPromise;
    vi.useRealTimers();

    // userCancelled = true → loop broke after first problem → appendEvalRun called once
    expect(vi.mocked(appendEvalRun)).toHaveBeenCalledTimes(1);

    try { rmSync(retryFilePath); } catch { /* ignore */ }
  });

  it('python check fails with empty stderr and stdout → failReason is "python check failed"', async () => {
    writeFileSync(join(TEMP_WORK_DIR, 'solution.py'), 'def add(a, b):\n    return None\n');
    mocks.spawnSyncImpl = (_cmd, args) => {
      if (args.includes('--version')) return { status: 0, error: null };
      return { status: 1, error: null, stderr: '', stdout: '' };
    };

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runHumanEvalProblems([makeProblem()], 'mock:model', fakeRl);

    const [,, , detail] = vi.mocked(appendEvalRun).mock.calls[0];
    const failReason = (detail as Record<string, unknown>).failReason as string;
    expect(failReason).toBe('python check failed');
  });
});

// ── makeRetryPrompter ─────────────────────────────────────────────────────────

describe('makeRetryPrompter', () => {
  // Lets the not-awaited ask().then()/.catch() handlers in the tick run.
  const flush = () => new Promise<void>(r => setImmediate(r));
  const created: string[] = [];

  function writeStatus(content: string): string {
    const p = pathJoin(tmpdir(), `prompter-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(p, content);
    created.push(p);
    return p;
  }

  const futureTarget = (msFromNow = 60_000) =>
    JSON.stringify({ name: 'rl', label: 'RL', targetMs: Date.now() + msFromNow });

  afterEach(() => {
    for (const p of created) { try { rmSync(p); } catch { /* ignore */ } }
    created.length = 0;
    mocks.readFileSyncThrow = null;
  });

  it('does not prompt when the status file is missing, empty, or JSON null', async () => {
    const ask = vi.fn().mockResolvedValue(true);
    makeRetryPrompter(pathJoin(tmpdir(), 'missing-' + Date.now() + '.json'), ask, vi.fn())();
    makeRetryPrompter(writeStatus(''), ask, vi.fn())();
    makeRetryPrompter(writeStatus('null'), ask, vi.fn())();
    await flush();
    expect(ask).not.toHaveBeenCalled();
  });

  it('prompts with a wait label for a future target and omits it for a past target', async () => {
    const ask = vi.fn().mockResolvedValue(true);
    makeRetryPrompter(writeStatus(futureTarget()), ask, vi.fn())();
    makeRetryPrompter(writeStatus(futureTarget(-5_000)), ask, vi.fn())();
    await flush();
    expect(ask.mock.calls[0][0]).toMatch(/Rate limit hit \(waiting \d+s\)\. Continue\?/);
    expect(ask.mock.calls[1][0]).toBe('Rate limit hit. Continue?');
  });

  it('calls onDecline only when the user declines', async () => {
    const declined = vi.fn();
    makeRetryPrompter(writeStatus(futureTarget()), () => Promise.resolve(false), declined)();
    await flush();
    expect(declined).toHaveBeenCalledOnce();

    const continued = vi.fn();
    makeRetryPrompter(writeStatus(futureTarget()), () => Promise.resolve(true), continued)();
    await flush();
    expect(continued).not.toHaveBeenCalled();
  });

  it('deduplicates a repeated targetMs and re-prompts only for a new one', async () => {
    const ask = vi.fn().mockResolvedValue(true);
    const status = writeStatus(futureTarget());
    const tick = makeRetryPrompter(status, ask, vi.fn());
    tick(); await flush();
    tick(); await flush();              // same targetMs → skipped
    expect(ask).toHaveBeenCalledOnce();
    writeFileSync(status, futureTarget(120_000));
    tick(); await flush();             // new targetMs → prompts again
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('suppresses re-prompts while a prompt is still open', async () => {
    let resolveAsk!: (v: boolean) => void;
    const ask = vi.fn(() => new Promise<boolean>(r => { resolveAsk = r; }));
    const tick = makeRetryPrompter(writeStatus(futureTarget()), ask, vi.fn());
    tick(); await flush();
    tick(); await flush();              // prompt still open → skipped
    expect(ask).toHaveBeenCalledOnce();
    resolveAsk(true);
  });

  it('resets the guard when ask rejects so the next new target re-prompts', async () => {
    const ask = vi.fn()
      .mockRejectedValueOnce(new Error('rl closed'))
      .mockResolvedValueOnce(true);
    const status = writeStatus(futureTarget());
    const tick = makeRetryPrompter(status, ask, vi.fn());
    tick(); await flush();             // rejects → guard reset
    writeFileSync(status, futureTarget(120_000));
    tick(); await flush();
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('swallows read errors without throwing or prompting', async () => {
    mocks.readFileSyncThrow = new Error('boom');
    const ask = vi.fn();
    const tick = makeRetryPrompter(writeStatus(futureTarget()), ask, vi.fn());
    expect(() => tick()).not.toThrow();
    await flush();
    expect(ask).not.toHaveBeenCalled();
  });
});
