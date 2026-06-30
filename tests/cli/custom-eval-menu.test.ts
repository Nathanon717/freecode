import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Hoisted stores ─────────────────────────────────────────────────────────────

const { mocks } = vi.hoisted(() => {
  const mocks = {
    evalHandle: null as null | {
      promise: Promise<unknown>;
      cancel: () => void;
      retryStatusFile: string;
      resultFile: string;
    },
    checkReport: null as null | {
      scenarioId: string;
      checks: Array<{ kind: 'assertion' | 'stat' | 'warning'; name: string; pass?: boolean; message?: string }>;
    },
    deadIds: [] as string[],
  };
  return { mocks };
});

// ── Module mocks (must be top-level before imports) ───────────────────────────

const mockAccent = Object.assign((s: string) => s, { bold: (s: string) => s, black: (s: string) => s });
vi.mock('../../src/cli/banner.js', () => ({
  getBannerColor: () => mockAccent,
}));

vi.mock('../../src/eval/runner.js', () => ({
  resetEvalWorkDir: vi.fn(),
  loadEvalConfig: vi.fn(() => ({})),
  startEvalScenario: vi.fn(() => mocks.evalHandle),
  runCheckScript: vi.fn(() => mocks.checkReport),
  archiveEvalRun: vi.fn(),
}));

vi.mock('../../src/cli/eval-screen.js', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('../../src/cli/eval-screen.js')>();
  return {
    ...actual,
    printEvalHeader: vi.fn(),
    printEvalReport: vi.fn(),
    printEvalSummary: vi.fn(),
  };
});

vi.mock('../../src/cli/terminal-ui.js', () => ({
  setActiveModel: vi.fn(),
  setActiveModelFromString: vi.fn(),
  setQuotaSnapshot: vi.fn(),
  setRetryBanner: vi.fn(),
  setTokenCount: vi.fn(),
}));

vi.mock('../../src/providers/model-store.js', () => ({
  appendEvalRun: vi.fn(),
}));

vi.mock('../../src/providers/model-cache.js', () => ({
  getDeadIds: vi.fn(() => mocks.deadIds),
}));

vi.mock('../../src/providers/registry.js', () => ({
  invalidateDeadModel: vi.fn(),
}));

vi.mock('../../src/agent/system-prompt.js', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('mock system prompt'),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { buildCustomEvalTab, runEvalScenarios } from '../../src/cli/custom-eval-menu.js';
import type { CustomEval } from '../../src/eval/custom.js';
import { CUSTOM_EVAL_DIR } from '../../src/eval/custom.js';
import { VIEWPORT_SIZE } from '../../src/cli/list-menu.js';
import { appendEvalRun } from '../../src/providers/model-store.js';
import { invalidateDeadModel } from '../../src/providers/registry.js';
import { printEvalSummary } from '../../src/cli/eval-screen.js';
import type { EvalReport } from '../../src/eval/runner.js';
import type { EvalHistoryEntry } from '../../src/eval/history.js';

// ── Shared helpers ────────────────────────────────────────────────────────────

function makeScenario(id = 's-01'): CustomEval {
  return { id, firstLine: `First line of ${id}` };
}

// ── buildCustomEvalTab ────────────────────────────────────────────────────────

describe('buildCustomEvalTab', () => {
  const scenarios = [makeScenario('s-01'), makeScenario('s-02')];

  it('count() returns scenarios.length', () => {
    const tab = buildCustomEvalTab(scenarios, [], new Map(), () => '', (s) => s);
    expect(tab.count()).toBe(2);
  });

  it('count() returns 0 when no scenarios', () => {
    const tab = buildCustomEvalTab([], [], new Map(), () => '', (s) => s);
    expect(tab.count()).toBe(0);
  });

  it('renderBody(-1) does not throw and highlights no row', () => {
    const tab = buildCustomEvalTab(scenarios, [], new Map(), () => '', (s) => s);
    expect(() => tab.renderBody(-1)).not.toThrow();
    const body = tab.renderBody(-1);
    expect(body.lines.some(l => l.includes('▶'))).toBe(false);
  });

  it('renderBody(0) sets selectedLineIdx to 0 and includes the scenario id', () => {
    const tab = buildCustomEvalTab(scenarios, [], new Map(), () => '', (s) => s);
    const body = tab.renderBody(0);
    expect(body.selectedLineIdx).toBe(0);
    expect(body.lines.join('\n')).toContain('s-01');
  });

  it('renderDetail shows "No results yet" when history is empty', () => {
    const tab = buildCustomEvalTab(scenarios, [], new Map(), () => '', (s) => s);
    expect(tab.renderDetail!(0).join('\n')).toContain('No results yet');
  });

  it('renderDetail shows pass badge and check name when history entry matches', () => {
    const history: EvalHistoryEntry[] = [{
      scenarioId: 's-01', model: 'm', scenarioHash: 'rh', pass: true,
      checks: [{ kind: 'assertion', name: 'asserts-x', pass: true }],
      timestamp: '2026-01-01T00:00:00Z', tokens: { total: 0 },
    }];
    const hashes = new Map([['s-01', { runHash: 'rh', fullHash: 'fh' }]]);
    const tab = buildCustomEvalTab(scenarios, history, hashes, () => 'm', (s) => s);
    const detail = tab.renderDetail!(0).join('\n');
    expect(detail).toContain('PASS');
    expect(detail).toContain('asserts-x');
  });

  it('Run action closes with just the selected scenario', () => {
    const [s1, s2] = scenarios;
    const tab = buildCustomEvalTab([s1, s2], [], new Map(), () => '', (s) => s);
    const closed: unknown[] = [];
    const ctx = { getSelected: () => 1, close: (v: unknown) => closed.push(v), enterDetail: vi.fn() };
    tab.actionMenu!.onSelect('Run', ctx as never);
    expect(closed[0]).toEqual([s2]);
  });

  it('View action enters detail without closing', () => {
    const tab = buildCustomEvalTab(scenarios, [], new Map(), () => '', (s) => s);
    const enterDetail = vi.fn();
    const close = vi.fn();
    tab.actionMenu!.onSelect('View', { getSelected: () => 0, close, enterDetail } as never);
    expect(enterDetail).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it.each(['a', 'A'])("'%s' runs all scenarios and is consumed", (key) => {
    const tab = buildCustomEvalTab(scenarios, [], new Map(), () => '', (s) => s);
    const closed: unknown[] = [];
    const handled = tab.onKey!(key, { getSelected: () => 0, close: (v: unknown) => closed.push(v) } as never);
    expect(handled).toBe(true);
    expect(closed[0]).toEqual(scenarios);
  });

  it('ignores keys other than the run-all shortcut', () => {
    const tab = buildCustomEvalTab([makeScenario()], [], new Map(), () => '', (s) => s);
    expect(tab.onKey!('x', { getSelected: () => 0, close: vi.fn() } as never)).toBe(false);
  });

  it('controls string mentions navigation and run-all', () => {
    const tab = buildCustomEvalTab([], [], new Map(), () => '', (s) => s);
    expect(tab.controls).toContain('Up/Down');
    expect(tab.controls).toContain('run all');
  });

  it('viewport slides when the selected item is past VIEWPORT_SIZE', () => {
    const ss = Array.from({ length: 25 }, (_, i) => makeScenario(`s-${String(i).padStart(2, '0')}`));
    const tab = buildCustomEvalTab(ss, [], new Map(), () => '', (s) => s);
    const body = tab.renderBody(22);
    // selectedLineIdx must be in [0, VIEWPORT_SIZE) — viewport slid to keep item visible.
    expect(body.selectedLineIdx).toBeGreaterThanOrEqual(0);
    expect(body.selectedLineIdx).toBeLessThan(VIEWPORT_SIZE);
    const joined = body.lines.join('\n');
    expect(joined).toContain('s-22');
    expect(joined).not.toContain('s-00'); // scrolled past
  });
});

// ── runEvalScenarios ──────────────────────────────────────────────────────────

describe('runEvalScenarios', () => {
  const ID_A = '_unit-test-a';
  const ID_B = '_unit-test-b';
  const DIR_A = join(CUSTOM_EVAL_DIR, ID_A);
  const DIR_B = join(CUSTOM_EVAL_DIR, ID_B);

  function writeScenario(dir: string): void {
    mkdirSync(join(dir, 'eval'), { recursive: true });
    writeFileSync(join(dir, 'prompt.md'), 'Fix the bug\n');
    writeFileSync(join(dir, 'eval', 'check.ts'), '// check');
  }

  function makeHandle(overrides: { exitCode?: number } = {}) {
    return {
      promise: Promise.resolve({
        exitCode: overrides.exitCode ?? 0,
        stdout: '',
        stderr: '',
        toolCalls: [] as Array<{ tool: string; args: Record<string, unknown>; result?: unknown }>,
        tokens: { total: 100, prompt: 60, output: 40 },
        workDir: '/tmp/work',
        quota: null,
      }),
      cancel: vi.fn(),
      retryStatusFile: join(tmpdir(), 'custom-eval-test-retry.json'),
      resultFile: join(tmpdir(), 'custom-eval-test-result.json'),
    };
  }

  const passingReport: EvalReport = {
    scenarioId: ID_A,
    checks: [{ kind: 'assertion', name: 'check', pass: true }],
  };

  function lastRun() {
    const [, kind, summary, detail] = vi.mocked(appendEvalRun).mock.calls[0];
    return { kind, summary, detail: detail as Record<string, unknown> };
  }

  function captureLog(): string[] {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    return lines;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.evalHandle = makeHandle();
    mocks.checkReport = passingReport;
    mocks.deadIds = [];
  });

  afterEach(() => {
    rmSync(DIR_A, { recursive: true, force: true });
    rmSync(DIR_B, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('skips scenario and does not persist when prompt.md or check.ts is missing', async () => {
    const scenario: CustomEval = { id: '_unit-nonexistent-xyz', firstLine: 'test' };
    const logged = captureLog();
    await runEvalScenarios([scenario], 'openai:gpt-4o');
    expect(logged.some(l => l.includes('SKIP'))).toBe(true);
    expect(vi.mocked(appendEvalRun)).not.toHaveBeenCalled();
  });

  it('records pass:true when all assertions pass', async () => {
    writeScenario(DIR_A);
    captureLog();
    await runEvalScenarios([{ id: ID_A, firstLine: 'Fix' }], 'openai:gpt-4o');
    expect(vi.mocked(appendEvalRun)).toHaveBeenCalledOnce();
    expect(lastRun().summary.pass).toBe(true);
    expect(lastRun().kind).toBe('custom');
    expect(lastRun().summary.taskId).toBe(ID_A);
  });

  it('records pass:false when an assertion fails', async () => {
    writeScenario(DIR_A);
    mocks.checkReport = {
      scenarioId: ID_A,
      checks: [{ kind: 'assertion', name: 'check', pass: false, message: 'wrong' }],
    };
    captureLog();
    await runEvalScenarios([{ id: ID_A, firstLine: 'Fix' }], 'openai:gpt-4o');
    expect(lastRun().summary.pass).toBe(false);
  });

  it('records warnings:true when assertions pass but a warning fires', async () => {
    writeScenario(DIR_A);
    mocks.checkReport = {
      scenarioId: ID_A,
      checks: [
        { kind: 'assertion', name: 'check', pass: true },
        { kind: 'warning', name: 'style', pass: false },
      ],
    };
    captureLog();
    await runEvalScenarios([{ id: ID_A, firstLine: 'Fix' }], 'openai:gpt-4o');
    const { summary } = lastRun();
    expect(summary.pass).toBe(true);
    expect(summary.warnings).toBe(true);
  });

  it('logs INCOMPLETE and does not persist when the agent exits with non-zero code', async () => {
    writeScenario(DIR_A);
    mocks.evalHandle = makeHandle({ exitCode: 1 });
    const logged = captureLog();
    await runEvalScenarios([{ id: ID_A, firstLine: 'Fix' }], 'openai:gpt-4o');
    expect(logged.some(l => l.includes('INCOMPLETE'))).toBe(true);
    expect(vi.mocked(appendEvalRun)).not.toHaveBeenCalled();
  });

  it('invalidates dead model and skips persisting when model appears in deadIds', async () => {
    writeScenario(DIR_A);
    mocks.deadIds = ['gpt-4o'];
    captureLog();
    await runEvalScenarios([{ id: ID_A, firstLine: 'Fix' }], 'openai:gpt-4o');
    expect(vi.mocked(invalidateDeadModel)).toHaveBeenCalledWith('openai', 'gpt-4o');
    expect(vi.mocked(appendEvalRun)).not.toHaveBeenCalled();
  });

  it('prints summary when more than one scenario ran', async () => {
    writeScenario(DIR_A);
    writeScenario(DIR_B);
    captureLog();
    await runEvalScenarios(
      [{ id: ID_A, firstLine: 'Fix' }, { id: ID_B, firstLine: 'Fix' }],
      'openai:gpt-4o',
    );
    expect(vi.mocked(printEvalSummary)).toHaveBeenCalledOnce();
  });

  it('does not print summary when only one scenario ran', async () => {
    writeScenario(DIR_A);
    captureLog();
    await runEvalScenarios([{ id: ID_A, firstLine: 'Fix' }], 'openai:gpt-4o');
    expect(vi.mocked(printEvalSummary)).not.toHaveBeenCalled();
  });
});
