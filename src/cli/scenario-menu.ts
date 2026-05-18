import type { Interface } from 'readline';
import chalk from 'chalk';
import {
  findScenario,
  getScenarioSummaries,
  parseScenarioSelection,
  runScenario,
  type TestScenarioSummary,
} from './scenario-catalog.js';
import { isBottomUIActive, setupBottomUI, teardownBottomUI } from './terminal-ui.js';

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

export function printScriptedScenarioList(projectRoot: string, requiresLlm: boolean): void {
  const scenarios = getScenarioSummaries(projectRoot).filter(s => s.requiresLlm === requiresLlm);
  console.log(chalk.bold(requiresLlm ? 'LLM eval scenarios\n' : 'Verification scenarios\n'));
  for (const scenario of scenarios) {
    if (requiresLlm) {
      const checks = scenario.checks.length > 0 ? ` | checks: ${scenario.checks.join(', ')}` : '';
      console.log(`${scenario.name} [eval]${scenario.description ? ` - ${scenario.description}` : ''}${checks}`);
    } else {
      console.log(`${scenario.name} [verify]${scenario.description ? ` - ${scenario.description}` : ''}`);
    }
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

export async function runEvalMenu(rl: Interface, projectRoot: string): Promise<void> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const scenarios = getScenarioSummaries(projectRoot).filter(s => s.requiresLlm);
    if (scenarios.length === 0) {
      console.log(chalk.yellow('No LLM eval scenarios found at tests/scenarios/*.scenario.json'));
      return;
    }

    printScenarioMenu('LLM eval scenarios', scenarios, true);
    console.log(chalk.gray('\nEnter numbers/names separated by spaces or commas. Ranges like 1-3 are allowed. Blank cancels.'));

    const choice = (await askQuestion(rl, chalk.green('eval> '))).trim();
    if (!choice) return;

    const selected = parseScenarioSelection(choice, scenarios);
    if (selected.length === 0) {
      console.log(chalk.red(`Unknown eval selection: ${choice}`));
      return;
    }

    const answer = (await askQuestion(rl, chalk.yellow(`Run ${selected.length} eval${selected.length === 1 ? '' : 's'} against real LLM provider(s)? [y/n] `))).trim().toLowerCase();
    if (answer !== 'y' && answer !== 'yes') {
      console.log(chalk.dim('Cancelled.'));
      return;
    }

    let passed = 0;
    let failed = 0;
    for (const scenario of selected) {
      console.log(chalk.dim(`\nRunning ${scenario.name}...\n`));
      const result = runScenario(projectRoot, scenario.name, true);
      if (result.output.trim()) console.log(result.output.trimEnd());
      if (result.status === 0) {
        console.log(chalk.green(`\n${scenario.name} passed.`));
        passed++;
      } else {
        console.log(chalk.red(`\n${scenario.name} failed.`));
        failed++;
      }
    }

    const color = failed === 0 ? chalk.green : chalk.red;
    console.log(color(`\nEval results: ${passed} passed, ${failed} failed`));
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) setupBottomUI();
  }
}
