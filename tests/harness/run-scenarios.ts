#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { classifyScenario } from '../../src/scenario-classification.js';
import { assertScenarioExpectations } from './assertions/index.js';
import type { ScenarioExpectations, ToolTraceEvent } from './assertions/index.js';
import type { TtyScenario } from './pty/run-tty-scenario.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCENARIOS_DIR = join(__dirname, '..', 'scenarios');
const DIST_ENTRY = join(ROOT, 'dist', 'index.js');

interface Scenario {
  name: string;
  description: string;
  requiresLlm: boolean;
  workspace?: 'repo' | 'temp';
  config?: Record<string, unknown>;
  filesBefore?: Array<{ path: string; content: string }>;
  flags?: string[];
  model?: string;
  turns?: Array<{ input: string }>;
  expect?: ScenarioExpectations;
  tty?: TtyScenario;
}

function printCapturedOutput(stdout: string, stderr: string): void {
  console.log(chalk.dim('--- stdout ---'));
  console.log(stdout.slice(0, 8000).trimEnd() || chalk.dim('(empty)'));
  console.log(chalk.dim('--- stderr ---'));
  console.log(stderr.slice(0, 8000).trimEnd() || chalk.dim('(empty)'));
}

const args = process.argv.slice(2);
const skipLlm = args.includes('--skip-llm');
const onlyLlm = args.includes('--only-llm');
const noBuild = args.includes('--no-build');
const showDetails = args.includes('--details');
const onlyArg = args.find(arg => arg.startsWith('--only='));
const onlyScenario = onlyArg?.slice('--only='.length);

if (!noBuild) {
  console.log(chalk.dim('Building...'));
  const buildResult = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (buildResult.status !== 0) {
    console.error(chalk.red('Build failed — aborting.'));
    process.exit(1);
  }
  console.log('');
}

const scenarioFiles = readdirSync(SCENARIOS_DIR)
  .filter(f => f.endsWith('.scenario.json'))
  .sort();

const scenarios = scenarioFiles.map(file => ({
  file,
  scenario: JSON.parse(readFileSync(join(SCENARIOS_DIR, file), 'utf-8')) as Scenario,
}));

const classificationErrors = scenarios.flatMap(({ file, scenario }) =>
  classifyScenario(scenario).errors.map(error => `${file}: ${error}`),
);

if (classificationErrors.length > 0) {
  console.error(chalk.red('Scenario LLM classification errors:'));
  for (const error of classificationErrors) {
    console.error(`  ${chalk.red('-')} ${error}`);
  }
  process.exit(1);
}

let passed = 0;
let failed = 0;

const runnableScenarios = scenarios.filter(({ scenario }) => {
  if (skipLlm) return !scenario.requiresLlm;
  if (onlyLlm) return scenario.requiresLlm;
  return true;
});

for (const { file, scenario } of runnableScenarios) {
  if (onlyScenario && scenario.name !== onlyScenario && file !== onlyScenario && file !== `${onlyScenario}.scenario.json`) {
    continue;
  }

  if (scenario.tty) {
    if (showDetails) {
      console.log(`\n  ${chalk.cyan('RUN')}   ${chalk.cyan(scenario.name)}`);
      console.log(`        ${chalk.dim(scenario.description || '(no description)')}`);
      console.log(`        type: ${chalk.yellow('TTY screen verification')} | steps: ${chalk.magenta(String(scenario.tty.steps.length))}`);
    }

    const tmpHome = join(tmpdir(), `freecode-tty-${scenario.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpHome, { recursive: true });

    let ttyFailures: string[] = [];
    let ttyScreen = '';
    try {
      const { runTtyScenario } = await import('./pty/run-tty-scenario.js');
      const result = await runTtyScenario({
        scenarioName: scenario.name,
        tty: scenario.tty,
        entry: DIST_ENTRY,
        cwd: ROOT,
        env: {
          ...process.env,
          FREECODE_HOME: tmpHome,
          DEBUG_QUOTA: '0',
          FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
        },
      });
      ttyFailures = result.failures;
      ttyScreen = result.transcript;
    } catch (err) {
      ttyFailures = [`tty harness error: ${err instanceof Error ? err.message : String(err)}`];
    }

    if (ttyFailures.length === 0) {
      console.log(`  ${chalk.green('PASS')}  ${chalk.cyan(scenario.name)}`);
      passed++;
    } else {
      console.log(`  ${chalk.red('FAIL')}  ${chalk.cyan(scenario.name)}`);
      for (const f of ttyFailures) console.log(`          ${chalk.red(f)}`);
      failed++;
    }
    if (showDetails || process.env.VERBOSE) {
      console.log(chalk.dim('--- rendered screen ---'));
      console.log(ttyScreen.trimEnd() || chalk.dim('(empty)'));
      console.log(chalk.dim('--- end screen ---'));
    }

    try { rmSync(tmpHome, { recursive: true, force: true }); } catch {}
    continue;
  }

  if (showDetails) {
    const checks: string[] = [];
    if (scenario.expect.exitCode !== undefined) checks.push(`exitCode=${scenario.expect.exitCode}`);
    if (scenario.expect.stdoutContains?.length) checks.push(`stdoutContains=${scenario.expect.stdoutContains.length}`);
    if (scenario.expect.stdoutAbsent?.length) checks.push(`stdoutAbsent=${scenario.expect.stdoutAbsent.length}`);
    if (scenario.expect.files?.length) checks.push(`files=${scenario.expect.files.length}`);
    if (scenario.expect.toolTrace) checks.push('toolTrace');
    console.log(`\n  ${chalk.cyan('RUN')}   ${chalk.cyan(scenario.name)}`);
    console.log(`        ${chalk.dim(scenario.description || '(no description)')}`);
    console.log(`        type: ${chalk.yellow(scenario.requiresLlm ? 'LLM eval' : 'non-LLM verification')} | workspace: ${chalk.magenta(scenario.workspace ?? 'repo')}`);
    console.log(`        checks: ${checks.length > 0 ? checks.join(', ') : chalk.dim('(none)')}`);
  }

  const tmpHome = join(tmpdir(), `freecode-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const tmpWorkspace = join(tmpdir(), `freecode-workspace-${scenario.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpHome, { recursive: true });
  if (scenario.workspace === 'temp') mkdirSync(tmpWorkspace, { recursive: true });
  if (scenario.filesBefore?.length) {
    for (const file of scenario.filesBefore) {
      const fullPath = join(tmpWorkspace, file.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, file.content, 'utf-8');
    }
  }

  const inputLines = scenario.turns.map(t => t.input).join('\n');
  const inputFile = join(tmpHome, 'input.txt');
  writeFileSync(inputFile, inputLines, 'utf-8');
  const traceFile = join(tmpHome, 'trace.json');
  if (scenario.config) {
    writeFileSync(join(tmpHome, 'config.json'), JSON.stringify(scenario.config, null, 2), 'utf-8');
  }

  const cliArgs: string[] = [DIST_ENTRY];
  if (scenario.flags) cliArgs.push(...scenario.flags);
  if (scenario.model) { cliArgs.push('--model'); cliArgs.push(scenario.model); }
  cliArgs.push('--script', inputFile);

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  let trace: ToolTraceEvent[] = [];

  try {
    const result = spawnSync(process.execPath, cliArgs, {
      cwd: scenario.workspace === 'temp' ? tmpWorkspace : ROOT,
      env: {
        ...process.env,
        FREECODE_HOME: tmpHome,
        DEBUG_QUOTA: '0',
        FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
        ...(scenario.expect.toolTrace ? { FREECODE_TRACE_JSON: traceFile } : {}),
      },
      timeout: 60000,
      encoding: 'utf-8',
    });
    stdout = result.stdout ?? '';
    stderr = result.stderr ?? '';
    exitCode = result.status ?? 1;
    if (existsSync(traceFile)) {
      trace = JSON.parse(readFileSync(traceFile, 'utf-8')) as ToolTraceEvent[];
    }
  } catch (err) {
    stderr += `\nHarness error: ${err instanceof Error ? err.message : String(err)}`;
    exitCode = exitCode || 1;
  }

  const workspaceRoot = scenario.workspace === 'temp' ? tmpWorkspace : ROOT;
  const failures = assertScenarioExpectations({
    expect: scenario.expect,
    stdout,
    stderr,
    exitCode,
    trace,
    workspaceRoot,
    workspace: scenario.workspace ?? 'repo',
  });

  if (failures.length === 0) {
    console.log(`  ${chalk.green('PASS')}  ${chalk.cyan(scenario.name)}`);
    if (showDetails) {
      const calls = trace.map(event => event.tool);
      console.log(`        exitCode: ${chalk.green(String(exitCode))}`);
      if (scenario.expect.files?.length) {
        console.log(`        file checks: ${scenario.expect.files.map(f => f.path).join(', ')}`);
      }
      if (scenario.expect.toolTrace) {
        console.log(`        tools: ${calls.join(' -> ') || '(none)'}`);
      }
      printCapturedOutput(stdout, stderr);
    }
    passed++;
  } else {
    console.log(`  ${chalk.red('FAIL')}  ${chalk.cyan(scenario.name)}`);
    for (const f of failures) console.log(`          ${chalk.red(f)}`);
    if (showDetails || process.env.VERBOSE) {
      printCapturedOutput(stdout, stderr);
    }
    failed++;
  }

  try { rmSync(tmpHome, { recursive: true, force: true }); } catch {}
  if (scenario.workspace === 'temp') {
    try { rmSync(tmpWorkspace, { recursive: true, force: true }); } catch {}
  }
}

console.log('');
const resultColor = failed > 0 ? chalk.red : chalk.green;
console.log(resultColor(`Results: ${passed} passed, ${failed} failed`));

if (failed > 0) process.exit(1);
