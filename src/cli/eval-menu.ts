import { join } from 'path';
import type { Interface } from 'readline';
import chalk from 'chalk';
import { runMenuShell } from './menu-shell.js';
import { runListMenu, type MenuTab } from './list-menu.js';
import { countWrappedLines } from './raw-picker.js';
import { redrawBanner } from './banner.js';
import {
  PLAYGROUND_EVAL_DIR,
  discoverPlaygroundScenarios,
  computeRunHash,
  computeScenarioHash,
  getEvalStatus,
  statusCircle,
  loadEvalHistory,
  type PlaygroundScenario,
} from './eval-dots.js';
import { buildCustomEvalTab, runEvalScenarios, type ScenarioHashes } from './scenario-menu.js';
import {
  buildHumanEvalTab,
  ensureHumanEvalDataset,
  humanEvalDatasetPath,
  loadHumanEvalProblems,
  printHumanEvalList,
  runHumanEvalProblems,
  type HumanEvalProblem,
} from '../commands/humaneval.js';
import { getHumanEvalResults } from '../providers/model-store.js';
import { ensureStoreReady } from '../providers/db.js';
import { existsSync } from 'fs';

export type EvalTabId = 'custom' | 'humaneval';

// What the unified eval menu resolves with: a tagged choice dispatched to the
// matching run loop, or null when the user cancels.
type EvalChoice =
  | { kind: 'custom'; scenarios: PlaygroundScenario[] }
  | { kind: 'humaneval'; problems: HumanEvalProblem[] };

interface EvalMenuOptions {
  initialTab?: EvalTabId;
  /** Download seam for the HumanEval dataset (tests inject a stub). */
  downloadFn?: (url: string, dest: string) => Promise<void>;
}

// Entry point for `/eval` (opens the Custom tab).
export function runEvalMenu(
  rl: Interface,
  _projectRoot: string,
  getSelectedModel: () => string,
): Promise<void> {
  return runEvalMenuWith(rl, getSelectedModel, {});
}

// Entry point for `/humaneval` (opens the HumanEval tab; downloads the dataset
// first if needed). Keeps the legacy `_downloadFn` test seam as the 4th arg.
export function runHumanEvalMenu(
  rl: Interface,
  _projectRoot: string,
  getSelectedModel: () => string,
  downloadFn?: (url: string, dest: string) => Promise<void>,
): Promise<void> {
  return runEvalMenuWith(rl, getSelectedModel, { initialTab: 'humaneval', downloadFn });
}

function runEvalMenuWith(
  rl: Interface,
  getSelectedModel: () => string,
  opts: EvalMenuOptions,
): Promise<void> {
  return runMenuShell<void>(rl, {
    ensureReady: ensureStoreReady,
    run: () => runEvalMenuBody(rl, getSelectedModel, opts),
  });
}

async function runEvalMenuBody(
  rl: Interface,
  getSelectedModel: () => string,
  opts: EvalMenuOptions,
): Promise<void> {
  const initialTab: EvalTabId = opts.initialTab ?? 'custom';

  // Custom (playground/eval) tab data.
  const scenarios = discoverPlaygroundScenarios();
  const evalHistory = loadEvalHistory();
  const scenarioHashes = new Map<string, ScenarioHashes>(
    scenarios.map((s) => {
      const dir = join(PLAYGROUND_EVAL_DIR, s.id);
      return [s.id, { runHash: computeRunHash(dir), fullHash: computeScenarioHash(dir) }];
    }),
  );

  // HumanEval tab data. The dataset is only downloaded when entering via the
  // HumanEval tab; from /eval it loads lazily from disk if already present.
  let problems: HumanEvalProblem[] = [];
  if (initialTab === 'humaneval') {
    if (!(await ensureHumanEvalDataset(opts.downloadFn))) return;
    const loaded = loadHumanEvalProblems();
    if (loaded === null) return;
    problems = loaded;
  } else if (existsSync(humanEvalDatasetPath())) {
    problems = loadHumanEvalProblems() ?? [];
  }
  const model = getSelectedModel();
  const humanEvalResults = getHumanEvalResults(model);

  if (!process.stdin.isTTY) {
    if (initialTab === 'humaneval') {
      printHumanEvalList(problems);
    } else {
      printEvalScenariosList(scenarios, scenarioHashes, evalHistory, model);
    }
    return;
  }

  const tabs: MenuTab<EvalChoice | null>[] = [
    buildCustomEvalTab(scenarios, evalHistory, scenarioHashes, getSelectedModel, (s) => ({
      kind: 'custom',
      scenarios: s,
    })),
    buildHumanEvalTab(problems, humanEvalResults, (p) => ({ kind: 'humaneval', problems: p })),
  ];

  const chosen = await runListMenu<EvalChoice | null>(rl, {
    tabs,
    initialTabId: initialTab,
    countLines: countWrappedLines,
  });

  if (!chosen) {
    redrawBanner();
    return;
  }

  if (chosen.kind === 'custom') {
    await runEvalScenarios(chosen.scenarios, getSelectedModel());
  } else {
    await runHumanEvalProblems(chosen.problems, getSelectedModel(), rl);
  }
}

function printEvalScenariosList(
  scenarios: PlaygroundScenario[],
  scenarioHashes: Map<string, ScenarioHashes>,
  evalHistory: ReturnType<typeof loadEvalHistory>,
  model: string,
): void {
  console.log(chalk.bold('Eval scenarios\n'));
  for (const s of scenarios) {
    const h = scenarioHashes.get(s.id);
    const circle = statusCircle(getEvalStatus(s.id, h?.runHash ?? '', model, evalHistory, h?.fullHash));
    console.log(`  ${circle} ${chalk.cyan(s.id)}  ${chalk.gray(s.firstLine)}`);
  }
}
