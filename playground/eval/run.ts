#!/usr/bin/env tsx
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import chalk from 'chalk';
import { resetWorkDir, runScenario } from './shared/runner.js';
import type { EvalReport, CheckResult } from './shared/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ScenarioMeta {
  id: string;
  dir: string;
  prompt: string;
}

function discoverScenarios(): ScenarioMeta[] {
  return readdirSync(__dirname, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{3}-/.test(d.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(d => {
      const dir = join(__dirname, d.name);
      const promptPath = join(dir, 'prompt.md');
      const prompt = existsSync(promptPath) ? readFileSync(promptPath, 'utf-8').trim() : '';
      return { id: d.name, dir, prompt };
    });
}

function printReport(report: EvalReport): void {
  const assertions = report.checks.filter((c): c is CheckResult & { pass: boolean } => c.kind === 'assertion');
  const stats = report.checks.filter(c => c.kind === 'stat');
  const passed = assertions.filter(c => c.pass).length;
  const total = assertions.length;
  const allPassed = passed === total;

  const header = allPassed ? chalk.green('PASS') : chalk.red('FAIL');
  console.log(`\n${header}  ${chalk.bold(report.scenarioId)}  (${passed}/${total} assertions)`);

  for (const check of assertions) {
    const icon = check.pass ? chalk.green('✓') : chalk.red('✗');
    const name = check.pass ? chalk.dim(check.name) : check.name;
    console.log(`  ${icon}  ${name}`);
    if (!check.pass && check.message) {
      console.log(`     ${chalk.red(check.message)}`);
    }
  }

  if (stats.length > 0) {
    console.log(chalk.dim('\n  Stats:'));
    for (const stat of stats) {
      console.log(chalk.dim(`    ${stat.name}: ${stat.note ?? String(stat.value ?? '')}`));
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const filter = args[0];

  const scenarios = discoverScenarios();
  const selected = filter
    ? scenarios.filter(s => s.id === filter || s.id.startsWith(filter))
    : scenarios;

  if (selected.length === 0) {
    console.error(chalk.red(`No scenarios found${filter ? ` matching "${filter}"` : ''}`));
    process.exit(1);
  }

  console.log(chalk.bold(`Running ${selected.length} eval scenario${selected.length === 1 ? '' : 's'}...\n`));

  let passed = 0;
  let failed = 0;

  for (const scenario of selected) {
    if (!scenario.prompt) {
      console.log(chalk.yellow(`SKIP  ${scenario.id}  (no prompt.md)`));
      continue;
    }

    const checkPath = join(scenario.dir, 'eval', 'check.ts');
    if (!existsSync(checkPath)) {
      console.log(chalk.yellow(`SKIP  ${scenario.id}  (no eval/check.ts)`));
      continue;
    }

    process.stdout.write(chalk.dim(`Running ${scenario.id}...`));

    resetWorkDir(scenario.dir);
    const result = runScenario(scenario.dir, scenario.prompt);

    const { check } = await import(pathToFileURL(checkPath).href) as { check: (r: typeof result) => EvalReport };
    const report = check(result);

    const allPassed = report.checks
      .filter(c => c.kind === 'assertion')
      .every(c => c.pass);

    process.stdout.write('\r\x1b[2K');
    printReport(report);

    if (allPassed) passed++; else failed++;
  }

  console.log('');
  const color = failed > 0 ? chalk.red : chalk.green;
  console.log(color(`Results: ${passed} passed, ${failed} failed`));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(chalk.red('Fatal:'), err);
  process.exit(1);
});
