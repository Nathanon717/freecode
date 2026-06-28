import { join } from 'path';
import type { Interface } from 'readline';
import chalk from 'chalk';
import { runMenuShell } from './menu-shell.js';
import { runListMenu, type MenuTab } from './list-menu.js';
import { countWrappedLines } from './raw-picker.js';
import { drawFooter } from './terminal-ui.js';
import { redrawBanner } from './banner.js';
import {
  CUSTOM_EVAL_DIR,
  discoverCustomEvals,
  computeRunHash,
  computeScenarioHash,
  type CustomEval,
} from '../eval/custom.js';
import {
  getEvalStatus,
  loadEvalHistory,
} from '../eval/history.js';
import { statusCircle } from './eval-dots.js';
import { buildCustomEvalTab, runEvalScenarios, type ScenarioHashes } from './custom-eval-menu.js';
import { buildHumanEvalTab, runHumanEvalProblems } from './humaneval-menu.js';
import {
  humanEvalDatasetPath,
  loadHumanEvalProblems,
  type HumanEvalProblem,
} from '../eval/humaneval-data.js';
import { getHumanEvalResults } from '../providers/model-store.js';
import { ensureStoreReady } from '../providers/db.js';
import { existsSync } from 'fs';

export type EvalTabId = 'custom' | 'humaneval';

// What the unified eval menu resolves with: a tagged choice dispatched to the
// matching run loop, or null when the user cancels.
type EvalChoice =
  | { kind: 'custom'; scenarios: CustomEval[] }
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
  // Custom (evals/custom) tab data.
  const scenarios = discoverCustomEvals();
  const evalHistory = loadEvalHistory();
  const scenarioHashes = new Map<string, ScenarioHashes>(
    scenarios.map((s) => {
      const dir = join(CUSTOM_EVAL_DIR, s.id);
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

  // Tear down the menu UI fully and position cursor at row 1 before the first
  // eval prints. extraCleanup in runRawPicker only erases `rowCount` rows up
  // from the controls row, which misses rows 1..N when the list is short.
  process.stdout.write('\x1b[1;1H\x1b[J');
  drawFooter();

  if (chosen.kind === 'custom') {
    await runEvalScenarios(chosen.scenarios, getSelectedModel());
  } else {
    await runHumanEvalProblems(chosen.problems, getSelectedModel(), rl);
  }
}

function printEvalScenariosList(
  scenarios: CustomEval[],
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
