import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interface } from 'readline';

// ── Mocks: keep the orchestrator under test, stub its leaves ──────────────────

vi.mock('../../src/cli/menu-shell.js', () => ({
  // Passthrough: just run the body so we exercise runEvalMenuBody directly.
  runMenuShell: (_rl: unknown, opts: { run: () => Promise<void> }) => opts.run(),
}));

vi.mock('../../src/cli/list-menu.js', () => ({ runListMenu: vi.fn() }));

vi.mock('../../src/eval/playground.js', () => ({
  PLAYGROUND_EVAL_DIR: '/eval',
  discoverPlaygroundScenarios: vi.fn(() => [{ id: 's1', firstLine: 'first line' }]),
  computeRunHash: vi.fn(() => 'rh'),
  computeScenarioHash: vi.fn(() => 'fh'),
}));

vi.mock('../../src/eval/history.js', () => ({
  getEvalStatus: vi.fn(() => 'green'),
  loadEvalHistory: vi.fn(() => []),
}));

vi.mock('../../src/cli/eval-dots.js', () => ({
  statusCircle: vi.fn(() => '●'),
}));

vi.mock('../../src/cli/scenario-menu.js', () => ({
  buildCustomEvalTab: vi.fn((scenarios: unknown[]) => ({
    id: 'custom', label: 'Custom', count: () => scenarios.length,
    renderBody: () => ({ lines: [], selectedLineIdx: 0 }),
  })),
  runEvalScenarios: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/cli/humaneval-menu.js', () => ({
  buildHumanEvalTab: vi.fn((problems: unknown[]) => ({
    id: 'humaneval', label: 'HumanEval', count: () => problems.length,
    renderBody: () => ({ lines: [], selectedLineIdx: 0 }),
  })),
  printHumanEvalList: vi.fn(),
  runHumanEvalProblems: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/eval/humaneval-data.js', () => ({
  ensureHumanEvalDataset: vi.fn(() => Promise.resolve(true)),
  loadHumanEvalProblems: vi.fn(() => [{ task_id: 't/0', entry_point: 'add' }]),
  humanEvalDatasetPath: vi.fn(() => '/data.gz'),
}));

vi.mock('../../src/providers/model-store.js', () => ({ getHumanEvalResults: vi.fn(() => ({})) }));
vi.mock('../../src/providers/db.js', () => ({ ensureStoreReady: vi.fn(() => Promise.resolve()) }));
const mockAccent = Object.assign((s: string) => s, { bold: (s: string) => s, black: (s: string) => s });
vi.mock('../../src/cli/banner.js', () => ({ redrawBanner: vi.fn(), getBannerColor: () => mockAccent, getBannerColorRGB: () => [170, 232, 255] as [number, number, number] }));
vi.mock('fs', () => ({ existsSync: vi.fn(() => true) }));

import { runEvalMenu } from '../../src/cli/eval-menu.js';
import { runListMenu } from '../../src/cli/list-menu.js';
import { runEvalScenarios } from '../../src/cli/scenario-menu.js';
import { runHumanEvalProblems } from '../../src/cli/humaneval-menu.js';
import { redrawBanner } from '../../src/cli/banner.js';

const fakeRl = { pause: vi.fn(), resume: vi.fn() } as unknown as Interface;
const getModel = (): string => 'openai:gpt-4o';

const originalIsTTY = process.stdin.isTTY;
function setTty(v: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', { value: v, configurable: true });
}

beforeEach(() => { vi.clearAllMocks(); setTty(true); });
afterEach(() => { Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true }); });

describe('runEvalMenu (unified)', () => {
  it('opens both tabs on the custom tab and dispatches a custom choice to runEvalScenarios', async () => {
    vi.mocked(runListMenu).mockResolvedValueOnce({ kind: 'custom', scenarios: [{ id: 's1' }] });
    await runEvalMenu(fakeRl, '/proj', getModel);

    const opts = vi.mocked(runListMenu).mock.calls[0][1] as { tabs: { id: string }[]; initialTabId?: string };
    expect(opts.tabs.map((t) => t.id)).toEqual(['custom', 'humaneval']);
    expect(opts.initialTabId).toBe('custom');
    expect(runEvalScenarios).toHaveBeenCalledWith([{ id: 's1' }], 'openai:gpt-4o');
    expect(runHumanEvalProblems).not.toHaveBeenCalled();
  });

  it('redraws the banner and runs nothing when cancelled', async () => {
    vi.mocked(runListMenu).mockResolvedValueOnce(null);
    await runEvalMenu(fakeRl, '/proj', getModel);
    expect(redrawBanner).toHaveBeenCalled();
    expect(runEvalScenarios).not.toHaveBeenCalled();
  });

  it('prints the scenario list in non-TTY mode', async () => {
    setTty(false);
    const logged: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')); });
    await runEvalMenu(fakeRl, '/proj', getModel);
    expect(runListMenu).not.toHaveBeenCalled();
    expect(logged.some((l) => l.includes('Eval scenarios'))).toBe(true);
  });
});

