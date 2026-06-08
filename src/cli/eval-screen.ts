import chalk from 'chalk';
import {
  getEvalStatus,
  statusCircle,
  type EvalCheckResult,
  type EvalHistoryEntry,
  type PlaygroundScenario,
  type ScenarioHashes,
} from './eval-dots.js';
import type { EvalReport } from './eval-runner.js';

export function printEvalReport(report: EvalReport): void {
  const assertions = report.checks.filter(c => c.kind === 'assertion');
  const warnings = report.checks.filter(c => c.kind === 'warning');
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
      for (const line of check.message.split('\n')) console.log(`     ${chalk.red(line)}`);
    }
  }

  const firedWarnings = warnings.filter(c => !c.pass);
  if (firedWarnings.length > 0) {
    console.log(chalk.hex('#FFA500')('\n  Warnings:'));
    for (const w of firedWarnings) {
      const text = w.message ?? w.name;
      for (const line of text.split('\n')) console.log(chalk.hex('#FFA500')(`    ! ${line}`));
    }
  }

  if (stats.length > 0) {
    console.log(chalk.dim('\n  Stats:'));
    for (const stat of stats) {
      console.log(chalk.dim(`    ${stat.name}: ${stat.note ?? String(stat.value ?? '')}`));
    }
  }
}

export function buildEvalPickerScreen(
  scenarios: PlaygroundScenario[],
  selected: number,
  history: EvalHistoryEntry[],
  model: string,
  scenarioHashes: Map<string, ScenarioHashes>,
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan('Eval scenarios')}`);
  lines.push(`  ${chalk.dim('Up/Down navigate, Enter run, a run all, → details, Esc close')}`);
  lines.push('');
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const active = i === selected;
    const cursor = active ? chalk.cyan('>') : ' ';
    const label = active ? chalk.inverse(s.id) : chalk.cyan(s.id);
    const h = scenarioHashes.get(s.id);
    const circle = statusCircle(getEvalStatus(s.id, h?.runHash ?? '', model, history, h?.fullHash));
    lines.push(`  ${cursor} ${circle} ${label}  ${chalk.dim(s.firstLine)}`);
  }
  lines.push('');
  return lines;
}

export function buildEvalDetailScreen(
  scenario: PlaygroundScenario,
  entry: EvalHistoryEntry | null,
  model: string,
): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${chalk.bold.cyan(scenario.id)}`);
  lines.push(`  ${chalk.dim('← / Esc back')}`);
  lines.push('');

  if (!entry) {
    lines.push(`  ${chalk.gray('No results yet')}`);
    lines.push('');
    return lines;
  }

  const checks = entry.checks;
  if (!checks || checks.length === 0) {
    const badge = entry.pass ? chalk.green('PASS') : chalk.red('FAIL');
    lines.push(`  ${badge}  ${chalk.dim(entry.timestamp.slice(0, 10))}  ${chalk.dim(model)}`);
    lines.push(`  ${chalk.gray('(run again to capture grading details)')}`);
    lines.push('');
    return lines;
  }

  const assertions = checks.filter((c: EvalCheckResult) => c.kind === 'assertion');
  const warnings = checks.filter((c: EvalCheckResult) => c.kind === 'warning');
  const stats = checks.filter((c: EvalCheckResult) => c.kind === 'stat');
  const passed = assertions.filter((c: EvalCheckResult) => c.pass).length;
  const total = assertions.length;
  const allPassed = passed === total;

  const badge = allPassed ? chalk.green('PASS') : chalk.red('FAIL');
  lines.push(`  ${badge}  (${passed}/${total} assertions)  ${chalk.dim(entry.timestamp.slice(0, 10))}  ${chalk.dim(model)}`);
  lines.push('');

  for (const check of assertions) {
    const icon = check.pass ? chalk.green('✓') : chalk.red('✗');
    const name = check.pass ? chalk.dim(check.name) : check.name;
    lines.push(`    ${icon}  ${name}`);
    if (!check.pass && check.message) {
      for (const line of check.message.split('\n')) lines.push(`       ${chalk.red(line)}`);
    }
  }

  const firedWarnings = warnings.filter((c: EvalCheckResult) => !c.pass);
  if (firedWarnings.length > 0) {
    lines.push('');
    lines.push(chalk.hex('#FFA500')('  Warnings:'));
    for (const w of firedWarnings) {
      const text = w.message ?? w.name;
      for (const line of text.split('\n')) lines.push(chalk.hex('#FFA500')(`    ! ${line}`));
    }
  }

  if (stats.length > 0) {
    lines.push('');
    lines.push(chalk.dim('  Stats:'));
    for (const stat of stats) {
      lines.push(chalk.dim(`    ${stat.name}: ${stat.note ?? String(stat.value ?? '')}`));
    }
  }

  lines.push('');
  return lines;
}
