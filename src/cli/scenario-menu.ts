import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import type { Interface } from 'readline';
import chalk from 'chalk';
import {
  findScenario,
  getScenarioSummaries,
  runScenario,
  type TestScenarioSummary,
} from './scenario-catalog.js';

import { isBottomUIActive, setupBottomUI, teardownBottomUI } from './terminal-ui.js';

const _dirname = dirname(fileURLToPath(import.meta.url));
const PLAYGROUND_EVAL_DIR = resolve(_dirname, '..', '..', 'playground', 'eval');

interface PlaygroundScenario {
  id: string;
  firstLine: string;
}

function discoverPlaygroundScenarios(): PlaygroundScenario[] {
  if (!existsSync(PLAYGROUND_EVAL_DIR)) return [];
  return readdirSync(PLAYGROUND_EVAL_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{3}-/.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(d => {
      const dir = join(PLAYGROUND_EVAL_DIR, d.name);
      return existsSync(join(dir, 'prompt.md')) && existsSync(join(dir, 'eval', 'check.ts'));
    })
    .map(d => {
      const promptPath = join(PLAYGROUND_EVAL_DIR, d.name, 'prompt.md');
      const firstLine = readFileSync(promptPath, 'utf-8').trim().split('\n')[0].slice(0, 80);
      return { id: d.name, firstLine };
    });
}

async function askQuestion(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function printScenarioMenu(title: string, scenarios: TestScenarioSummary[], showDetails: boolean): void {
  console.log(chalk.bold(`${title}\n`));
  scenarios.forEach((scenario, idx) => {
    const marker = scenario.requiresLlm ? chalk.yellow('eval') : chalk.green('verify');
    const description = scenario.description ? chalk.gray(` - ${scenario.description}`) : '';
    console.log(`${String(idx + 1).padStart(2, ' ')}. ${chalk.cyan(scenario.name)} ${marker}${description}`);
    if (showDetails) {
      const checks = scenario.checks.length > 0 ? scenario.checks.join(', ') : 'no explicit assertions';
      console.log(chalk.gray(`    file: ${scenario.file} | workspace: ${scenario.workspace} | checks: ${checks}`));
    }
  });
}

export function printScriptedScenarioList(projectRoot: string): void {
  const scenarios = getScenarioSummaries(projectRoot).filter(s => !s.requiresLlm);
  console.log(chalk.bold('Verification scenarios\n'));
  for (const scenario of scenarios) {
    console.log(`${scenario.name} [verify]${scenario.description ? ` - ${scenario.description}` : ''}`);
  }
}

export async function runTestMenu(rl: Interface, projectRoot: string): Promise<void> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const scenarios = getScenarioSummaries(projectRoot).filter(s => !s.requiresLlm);
    if (scenarios.length === 0) {
      console.log(chalk.yellow('No non-LLM verification scenarios found at tests/scenarios/*.scenario.json'));
      return;
    }

    printScenarioMenu('Verification scenarios', scenarios, false);
    console.log(chalk.gray('\nEnter a number/name to run one scenario, or blank to cancel.'));

    const choice = (await askQuestion(rl, chalk.green('test> '))).trim();
    if (!choice) return;

    const selected = findScenario(scenarios, choice);

    if (!selected) {
      console.log(chalk.red(`Unknown verification scenario: ${choice}`));
      return;
    }

    console.log(chalk.dim(`Running ${selected.name}...\n`));
    const result = runScenario(projectRoot, selected.name);
    if (result.status === 0) {
      if (result.output.trim()) console.log(result.output.trimEnd());
      console.log(chalk.green(`\n${selected.name} passed.`));
    } else {
      if (result.output.trim()) console.log(result.output.trimEnd());
      console.log(chalk.red(`\n${selected.name} failed.`));
    }
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) setupBottomUI();
  }
}

export async function runEvalMenu(rl: Interface, _projectRoot: string, getSelectedModel: () => string): Promise<void> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const scenarios = discoverPlaygroundScenarios();
    if (scenarios.length === 0) {
      console.log(chalk.yellow('No eval scenarios found in playground/eval/.'));
      return;
    }

    console.log(chalk.bold('Eval scenarios\n'));
    scenarios.forEach((s, idx) => {
      console.log(`${String(idx + 1).padStart(2, ' ')}. ${chalk.cyan(s.id)}  ${chalk.gray(s.firstLine)}`);
    });

    console.log(chalk.gray('\nEnter a number or id to run one, "all" to run all, or blank to cancel.'));

    const choice = (await askQuestion(rl, chalk.green('eval> '))).trim().toLowerCase();
    if (!choice) return;

    let selected: PlaygroundScenario[];
    if (choice === 'all') {
      selected = scenarios;
    } else {
      const byIndex = /^\d+$/.test(choice) ? scenarios[parseInt(choice, 10) - 1] : undefined;
      const byId = scenarios.find(s => s.id === choice || s.id.startsWith(choice));
      const match = byIndex ?? byId;
      if (!match) {
        console.log(chalk.red(`Unknown eval scenario: ${choice}`));
        return;
      }
      selected = [match];
    }

    const model = getSelectedModel();
    const answer = (await askQuestion(rl, chalk.yellow(`Run ${selected.length} eval${selected.length === 1 ? '' : 's'} using ${model || 'default model'}? [y/n] `))).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      console.log(chalk.dim('Cancelled.'));
      return;
    }

    const runScript = join(PLAYGROUND_EVAL_DIR, 'run.ts');
    for (const scenario of selected) {
      spawnSync(process.execPath, ['--import', 'tsx', runScript, scenario.id], {
        stdio: 'inherit',
        env: { ...process.env, ...(model ? { FREECODE_MODEL: model } : {}) },
      });
    }
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) setupBottomUI();
  }
}
