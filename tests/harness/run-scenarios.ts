#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync, spawn } from 'child_process';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { classifyScenario } from '../../src/scenario-classification.js';
import { PROVIDER_REGISTRY } from '../../src/providers/registry.js';
import { assertScenarioExpectations } from './assertions/index.js';
import type { ScenarioExpectations, ToolTraceEvent } from './assertions/index.js';
import type { TtyScenario } from './pty/run-tty-scenario.js';

// Env vars to strip from all non-LLM test processes so provider API fetches
// can't make live network requests.
const PROVIDER_API_KEY_VARS = new Set(PROVIDER_REGISTRY.map(p => p.apiKeyEnvVar));

// Base env with all provider API keys removed, used for every non-LLM subprocess.
const safeBaseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !PROVIDER_API_KEY_VARS.has(k)),
);

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
const skipTty = args.includes('--skip-tty');
const onlyTty = args.includes('--only-tty');
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
  if (skipLlm && scenario.requiresLlm) return false;
  if (onlyLlm && !scenario.requiresLlm) return false;
  if (skipTty && scenario.tty) return false;
  if (onlyTty && !scenario.tty) return false;
  return true;
});

// Run TTY scenarios in parallel — each spawns its own isolated PTY process.
const ttyScenarios = runnableScenarios.filter(({ file, scenario }) => {
  if (onlyScenario && scenario.name !== onlyScenario && file !== onlyScenario && file !== `${onlyScenario}.scenario.json`) return false;
  return !!scenario.tty;
});

if (ttyScenarios.length > 0) {
  const { runTtyScenario } = await import('./pty/run-tty-scenario.js');

  const ttyResults = await Promise.all(ttyScenarios.map(async ({ scenario }) => {
    if (showDetails) {
      console.log(`\n  ${chalk.cyan('RUN')}   ${chalk.cyan(scenario.name)}`);
      console.log(`        ${chalk.dim(scenario.description || '(no description)')}`);
      console.log(`        type: ${chalk.yellow('TTY screen verification')} | steps: ${chalk.magenta(String(scenario.tty!.steps.length))}`);
    }

    const tmpHome = join(tmpdir(), `freecode-tty-${scenario.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpHome, { recursive: true });
    if (scenario.config) {
      writeFileSync(join(tmpHome, 'config.json'), JSON.stringify(scenario.config, null, 2), 'utf-8');
    }

    let ttyFailures: string[];
    let ttyScreen = '';
    try {
      const result = await runTtyScenario({
        scenarioName: scenario.name,
        tty: scenario.tty!,
        entry: DIST_ENTRY,
        cwd: ROOT,
        env: { ...safeBaseEnv, FREECODE_HOME: tmpHome, DEBUG_QUOTA: '0', FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
      });
      ttyFailures = result.failures;
      ttyScreen = result.transcript;
    } catch (err) {
      ttyFailures = [`tty harness error: ${err instanceof Error ? err.message : String(err)}`];
    }

    try { rmSync(tmpHome, { recursive: true, force: true }); } catch (err) { console.error('[cleanup] failed to remove tmpHome:', err); }
    return { name: scenario.name, failures: ttyFailures, screen: ttyScreen };
  }));

  for (const { name, failures, screen } of ttyResults) {
    if (failures.length === 0) {
      passed++;
    } else {
      console.log(`  ${chalk.red('FAIL')}  ${chalk.cyan(name)}`);
      for (const f of failures) console.log(`          ${chalk.red(f)}`);
      failed++;
    }
    if (showDetails || process.env.VERBOSE) {
      console.log(chalk.dim('--- rendered screen ---'));
      console.log(screen.trimEnd() || chalk.dim('(empty)'));
      console.log(chalk.dim('--- end screen ---'));
    }
  }
}

const nonTtyScenarios = runnableScenarios.filter(({ file, scenario }) => {
  if (onlyScenario && scenario.name !== onlyScenario && file !== onlyScenario && file !== `${onlyScenario}.scenario.json`) return false;
  return !scenario.tty;
});

if (nonTtyScenarios.length > 0) {
  const nonTtyResults = await Promise.all(nonTtyScenarios.map(async ({ scenario }) => {
    const tmpHome = join(tmpdir(), `freecode-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tmpWorkspace = join(tmpdir(), `freecode-workspace-${scenario.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpHome, { recursive: true });
    if (scenario.workspace === 'temp') mkdirSync(tmpWorkspace, { recursive: true });
    if (scenario.filesBefore?.length) {
      for (const f of scenario.filesBefore) {
        const fullPath = join(tmpWorkspace, f.path);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, f.content, 'utf-8');
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
    let exitCode: number;
    let trace: ToolTraceEvent[] = [];

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
        const child = spawn(process.execPath, cliArgs, {
          cwd: scenario.workspace === 'temp' ? tmpWorkspace : ROOT,
          env: {
            ...safeBaseEnv,
            FREECODE_HOME: tmpHome,
            DEBUG_QUOTA: '0',
            FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
            ...(scenario.requiresLlm ? {} : { FREECODE_NO_LLM: '1' }),
            ...(scenario.expect.toolTrace ? { FREECODE_TRACE_JSON: traceFile } : {}),
          },
        });
        let out = '';
        let err = '';
        child.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
        child.on('close', (code) => resolve({ stdout: out, stderr: err, exitCode: code ?? 1 }));
        child.on('error', (e) => resolve({ stdout: out, stderr: err + `\nHarness error: ${e.message}`, exitCode: 1 }));
        setTimeout(() => { child.kill(); resolve({ stdout: out, stderr: err + '\nHarness error: timeout', exitCode: 1 }); }, 60000);
      });
      stdout = result.stdout;
      stderr = result.stderr;
      exitCode = result.exitCode;
      if (existsSync(traceFile)) {
        trace = JSON.parse(readFileSync(traceFile, 'utf-8')) as ToolTraceEvent[];
      }
    } catch (err) {
      stderr += `\nHarness error: ${err instanceof Error ? err.message : String(err)}`;
      exitCode = 1;
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

    try { rmSync(tmpHome, { recursive: true, force: true }); } catch (err) { console.error('[cleanup] failed to remove tmpHome:', err); }
    if (scenario.workspace === 'temp') {
      try { rmSync(tmpWorkspace, { recursive: true, force: true }); } catch (err) { console.error('[cleanup] failed to remove tmpWorkspace:', err); }
    }

    return { scenario, failures, stdout, stderr, exitCode, trace };
  }));

  for (const { scenario, failures, stdout, stderr, exitCode, trace } of nonTtyResults) {
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

    if (failures.length === 0) {
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
  }
}

if (failed > 0) {
  console.log('');
  console.log(chalk.red(`Results: ${passed} passed, ${failed} failed`));
}

process.exit(failed > 0 ? 1 : 0);
