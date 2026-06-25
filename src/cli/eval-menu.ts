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
  type PlaygroundScenario,
} from '../eval/playground.js';
import {
  getEvalStatus,
  loadEvalHistory,
} from '../eval/history.js';
import { statusCircle } from './eval-dots.js';
import { buildCustomEvalTab, runEvalScenarios, type ScenarioHashes } from './scenario-menu.js';
import {
  buildHumanEvalTab,
  humanEvalDatasetPath,
  loadHumanEvalProblems,
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

// Entry point for `/eval` (opens the Custom tab).
export function runEvalMenu(
  rl: Interface,
  _projectRoot: string,
  getSelectedModel: () => string,
): Promise<void> {
  return runMenuShell<void>(rl, {
    ensureReady: ensureStoreReady,
    run: () => runEvalMenuBody(rl, getSelectedModel),
  });
}

async function runEvalMenuBody(
  rl: Interface,
  getSelectedModel: () => string,
): Promise<void> {
  // Custom (playground/eval) tab data.
  const scenarios = discoverPlaygroundScenarios();
  const evalHistory = loadEvalHistory();
  const scenarioHashes = new Map<string, ScenarioHashes>(
    scenarios.map((s) => {
      const dir = join(PLAYGROUND_EVAL_DIR, s.id);
      return [s.id, { runHash: computeRunHash(dir), fullHash: computeScenarioHash(dir) }];
    }),
  );

  // HumanEval tab data: load from disk if the dataset is already present.
  let problems: HumanEvalProblem[] = [];
  if (existsSync(humanEvalDatasetPath())) {
    problems = loadHumanEvalProblems() ?? [];
  }
  const model = getSelectedModel();
  const humanEvalResults = getHumanEvalResults(model);

  if (!process.stdin.isTTY) {
    printEvalScenariosList(scenarios, scenarioHashes, evalHistory, model);
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
    initialTabId: 'custom',
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
