import { describe, expect, it } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProblem(overrides?: Partial<{
  task_id: string; prompt: string; canonical_solution: string; test: string; entry_point: string;
}>) {
  return {
    task_id: 'test/0',
    prompt: 'def add(a, b):\n    pass\n',
    canonical_solution: '    return a + b\n',
    test: 'def check(c):\n    assert c(1, 2) == 3\n',
    entry_point: 'add',
    ...overrides,
  };
}

// ── buildHumanEvalTab ─────────────────────────────────────────────────────────

describe('buildHumanEvalTab', () => {
  it('renders without crashing when the tab row is focused (selected = -1)', async () => {
    const { buildHumanEvalTab } = await import('../../src/commands/humaneval.js');
    // Empty problem list is the regression case: a negative viewport index used
    // to read past the array. The tab row focus (-1) must render no highlight.
    const tab = buildHumanEvalTab([], {}, (p) => p);
    expect(() => tab.renderBody(-1)).not.toThrow();
    const body = tab.renderBody(-1);
    expect(body.lines.some(l => l.includes('Run All'))).toBe(true);
  });

  it('closes with the chosen problems via the choose mapper', async () => {
    const { buildHumanEvalTab } = await import('../../src/commands/humaneval.js');
    const problems = [makeProblem({ task_id: 'p/1' }), makeProblem({ task_id: 'p/2' })];
    const tab = buildHumanEvalTab(problems, {}, (p) => ({ kind: 'humaneval' as const, problems: p }));
    const closed: unknown[] = [];
    const ctx = { getSelected: () => 0, close: (v: unknown) => closed.push(v) };
    // selected 0 = Run All → all problems
    tab.onEnter!(ctx as never);
    expect(closed[0]).toEqual({ kind: 'humaneval', problems });
  });
});
