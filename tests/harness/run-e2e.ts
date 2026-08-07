#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync, spawn } from 'child_process';
import { tmpdir, availableParallelism } from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { PROVIDER_REGISTRY } from '../../src/providers/provider-registry.js';
import { readTextFile } from '../../src/util/text-encoding.js';
import { assertE2eExpectations, outputRows } from './assertions/index.js';
import type { FakeLlmTraceEvent, E2eExpectations, ToolTraceEvent } from './assertions/index.js';
import type { TtyE2eTest } from './pty/run-tty-e2e.js';

/**
 * The ConPTY host node-pty loads is pinned to 1.23 by
 * `scripts/install/pin-conpty.cjs`, because the 1.25 that node-pty >= beta.12
 * vendors takes ~1-1.5s to deliver a resize to the child instead of 15ms — and
 * sometimes doesn't under load, which makes every `tty-resize-*` scenario flaky
 * (docs/bug log/29-07-2026e.md). Anything that reinstalls node-pty without
 * running our postinstall drops the pin, so say so loudly rather than let the
 * flakiness get re-diagnosed from scratch.
 */
function warnIfConptyUnpinned(): void {
  if (process.platform !== 'win32') return;
  const conptyDir = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds', `win32-${process.arch}`, 'conpty');
  if (!existsSync(conptyDir)) return; // not a prebuilt install; nothing to check
  if (readdirSync(conptyDir).some((entry) => entry.startsWith('.pinned-'))) return;
  console.warn(chalk.yellow('  WARN  ConPTY is not pinned — expect flaky tty-resize-* failures.'));
  console.warn(chalk.dim('        Run `npm run postinstall` (see scripts/install/pin-conpty.cjs).'));
}

// Env vars to strip from every e2e test subprocess so provider API fetches
// can't make live network requests. E2e tests never call a live LLM.
const PROVIDER_API_KEY_VARS = new Set(PROVIDER_REGISTRY.map(p => p.apiKeyEnvVar));

// Base env with all provider API keys removed, used for every e2e test subprocess.
const safeBaseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !PROVIDER_API_KEY_VARS.has(k)),
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const E2E_DIR = join(__dirname, '..', 'e2e');
const DIST_ENTRY = join(ROOT, 'dist', 'index.js');

interface E2eTest {
  name: string;
  description: string;
  workspace?: 'repo' | 'temp';
  config?: Record<string, unknown>;
  flags?: string[];
  model?: string;
  llmFixture?: string;
  turns?: Array<{ input: string }>;
  /**
   * Runs `freecode -p "<prompt>"` — the headless one-shot mode — instead of the
   * `--script` session. Mutually exclusive with `turns`, which the CLI rejects.
   */
  prompt?: string;
  expect?: E2eExpectations;
  tty?: TtyE2eTest;
  env?: Record<string, string>;
  humanEvalDataFixture?: string;
  humanEvalExampleDataFixture?: string;
}

// Each e2e test spawns its own freecode CLI process (and some spawn Python for
// grading). Running all of them at once with Promise.all oversubscribes the CPU
// — on a constrained box that starves process startup and the agent loop, so
// even the 30s readyText budget and the per-step waitFor budgets blow, failing
// e2e tests that are perfectly correct. Cap concurrency so each process gets a
// fair share. Override with E2E_CONCURRENCY.
const E2E_CONCURRENCY = (() => {
  const fromEnv = Number(process.env.E2E_CONCURRENCY);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.floor(fromEnv);
  return Math.max(2, Math.floor(availableParallelism() / 2));
})();

// Run `fn` over `items` with at most `limit` in flight at once, preserving the
// input order of results.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    let i = next++;
    while (i < items.length) {
      results[i] = await fn(items[i]);
      i = next++;
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// Remove a test's temp dir. The child CLI has exited by now, but Windows can hold
// a just-closed file briefly (AV scanners, delete-pending), so retry rather than
// leak the dir — `rm` retries exactly the EPERM/EBUSY/ENOTEMPTY family.
function removeTempDir(dir: string, label: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (err) {
    console.error(`[cleanup] failed to remove ${label}:`, err);
  }
}

function printCapturedOutput(stdout: string, stderr: string): void {
  console.log(chalk.dim('--- stdout ---'));
  console.log(stdout.slice(0, 8000).trimEnd() || chalk.dim('(empty)'));
  console.log(chalk.dim('--- stderr ---'));
  console.log(stderr.slice(0, 8000).trimEnd() || chalk.dim('(empty)'));
}

const args = process.argv.slice(2);
const skipTty = args.includes('--skip-tty');
const onlyTty = args.includes('--only-tty');
/** `E2E_DUMP=1` prints each non-TTY scenario's stdout as numbered rows, to author `stdoutBlock` from. */
const E2E_DUMP = !!process.env.E2E_DUMP;
const noBuild = args.includes('--no-build');
const showDetails = args.includes('--details');
const onlyArg = args.find(arg => arg.startsWith('--only='));
const onlyE2eTest = onlyArg?.slice('--only='.length);

// When set, per-e2e-test wall-clock timings are written to this path as JSON
// after the run. This only emits measurement data — it does not change which
// e2e tests run, their order, or concurrency. Used by `npm run time`.
const timingJsonPath = process.env.E2E_TIMING_JSON;
type PhaseTiming = { label: string; ms: number; ok: boolean };
const e2eTimings: Array<{ name: string; type: 'tty' | 'verify'; ms: number; ok: boolean; phases?: PhaseTiming[] }> = [];

if (!noBuild) {
  console.log(chalk.dim('Building...'));
  const buildResult = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (buildResult.status !== 0) {
    console.error(chalk.red('Build failed — aborting.'));
    process.exit(1);
  }
  console.log('');
}

const e2eFiles = readdirSync(E2E_DIR)
  .filter(f => f.endsWith('.e2e.json'))
  .sort();

const e2eTests = e2eFiles.map(file => {
  const raw = readTextFile(join(E2E_DIR, file));
  try {
    return { file, test: JSON.parse(raw) as E2eTest };
  } catch (err) {
    // A raw control byte (e.g. an ESC from a mangled `` escape) makes
    // JSON.parse throw without naming the file. Surface the file so the fix is
    // obvious; the e2e-json-bytes unit test guards against this earlier.
    console.error(chalk.red(`Failed to parse e2e test file ${file}: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
});

let passed = 0;
let failed = 0;

const runnableE2eTests = e2eTests.filter(({ test }) => {
  if (skipTty && test.tty) return false;
  if (onlyTty && !test.tty) return false;
  return true;
});

// Run TTY e2e tests in parallel — each spawns its own isolated PTY process.
const ttyE2eTests = runnableE2eTests.filter(({ file, test }) => {
  if (onlyE2eTest && test.name !== onlyE2eTest && file !== onlyE2eTest && file !== `${onlyE2eTest}.e2e.json`) return false;
  return !!test.tty;
});

if (ttyE2eTests.length > 0) {
  warnIfConptyUnpinned();
  const { runTtyE2eTest } = await import('./pty/run-tty-e2e.js');

  const ttyResults = await mapWithConcurrency(ttyE2eTests, E2E_CONCURRENCY, async ({ test }) => {
    const t0 = Date.now();
    if (showDetails) {
      console.log(`\n  ${chalk.cyan('RUN')}   ${chalk.cyan(test.name)}`);
      console.log(`        ${chalk.dim(test.description || '(no description)')}`);
      console.log(`        type: ${chalk.yellow('TTY screen verification')} | steps: ${chalk.magenta(String(test.tty!.steps.length))}`);
    }

    const tmpHome = join(tmpdir(), `freecode-tty-${test.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tmpStore = join(tmpdir(), `freecode-tty-store-${test.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpHome, { recursive: true });
    mkdirSync(tmpStore, { recursive: true });
    if (test.config) {
      writeFileSync(join(tmpHome, 'config.json'), JSON.stringify(test.config, null, 2), 'utf-8');
    }
    const fakeFixturePath = test.llmFixture ? join(E2E_DIR, test.llmFixture) : '';
    const fakeEvalResultPath = test.llmFixture && test.model
      ? join(ROOT, 'evals', 'custom', 'results', `${test.model.replace(/[:/]/g, '--')}.json`)
      : '';
    const previousFakeEvalResult = fakeEvalResultPath && existsSync(fakeEvalResultPath)
      ? readFileSync(fakeEvalResultPath, 'utf-8')
      : null;

    let ttyFailures: string[];
    let ttyScreen = '';
    let ttyPhases: PhaseTiming[] = [];
    try {
      const result = await runTtyE2eTest({
        testName: test.name,
        tty: test.tty!,
        entry: DIST_ENTRY,
        cwd: ROOT,
        env: {
          ...safeBaseEnv,
          FREECODE_HOME: tmpHome,
          FREECODE_STORE: tmpStore,
          DEBUG_QUOTA: '0',
          FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
          // Prevent Doppler injection and Turso sync in child processes — keeps tests
          // hermetic and avoids 5-10s network delays that cause readyText timeouts.
          DOPPLER_PROJECT: '1',
          FREECODE_DB_SYNC_URL: '',
          FREECODE_DB_AUTH_TOKEN: '',
          // Suppress startup model prefetch so TTY e2e tests don't fire live network calls.
          FREECODE_NO_PREFETCH: '1',
          ...(test.model ? { FREECODE_MODEL: test.model } : {}),
          ...(test.llmFixture ? { FREECODE_FAKE_LLM: '1', FREECODE_FAKE_LLM_SCRIPT: fakeFixturePath } : {}),
          ...(test.humanEvalDataFixture ? { HUMANEVAL_DATA: join(E2E_DIR, test.humanEvalDataFixture) } : {}),
          ...(test.humanEvalExampleDataFixture ? { HUMANEVAL_EXAMPLE_DATA: join(E2E_DIR, test.humanEvalExampleDataFixture) } : {}),
          ...(test.env ?? {}),
        },
      });
      ttyFailures = result.failures;
      ttyScreen = result.transcript;
      ttyPhases = result.phases;
    } catch (err) {
      ttyFailures = [`tty harness error: ${err instanceof Error ? err.message : String(err)}`];
    }

    if (fakeEvalResultPath) {
      try {
        if (previousFakeEvalResult === null) rmSync(fakeEvalResultPath, { force: true });
        else writeFileSync(fakeEvalResultPath, previousFakeEvalResult, 'utf-8');
      } catch (err) { console.error('[cleanup] failed to restore fake eval result:', err); }
    }
    removeTempDir(tmpHome, 'tmpHome');
    removeTempDir(tmpStore, 'tmpStore');
    return { name: test.name, failures: ttyFailures, screen: ttyScreen, ms: Date.now() - t0, phases: ttyPhases };
  });

  for (const { name, failures, screen, ms, phases } of ttyResults) {
    e2eTimings.push({ name, type: 'tty', ms, ok: failures.length === 0, phases: phases.length ? phases : undefined });
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

const nonTtyE2eTests = runnableE2eTests.filter(({ file, test }) => {
  if (onlyE2eTest && test.name !== onlyE2eTest && file !== onlyE2eTest && file !== `${onlyE2eTest}.e2e.json`) return false;
  return !test.tty;
});

if (nonTtyE2eTests.length > 0) {
  const nonTtyResults = await mapWithConcurrency(nonTtyE2eTests, E2E_CONCURRENCY, async ({ test }) => {
    const t0 = Date.now();
    const tmpHome = join(tmpdir(), `freecode-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tmpStore = join(tmpdir(), `freecode-store-${test.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const tmpWorkspace = join(tmpdir(), `freecode-workspace-${test.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpHome, { recursive: true });
    mkdirSync(tmpStore, { recursive: true });
    if (test.workspace === 'temp') mkdirSync(tmpWorkspace, { recursive: true });

    // A `prompt` scenario passes its input as an argv flag, so it declares no turns
    // and gets no script file — the CLI rejects `-p` together with `--script`.
    const inputLines = (test.turns ?? []).map(t => t.input).join('\n');
    const inputFile = join(tmpHome, 'input.txt');
    writeFileSync(inputFile, inputLines, 'utf-8');
    const traceFile = join(tmpHome, 'trace.json');
    const fakeTraceFile = join(tmpHome, 'fake-llm-trace.json');
    const fakeFixturePath = test.llmFixture ? join(E2E_DIR, test.llmFixture) : '';
    if (test.config) {
      writeFileSync(join(tmpHome, 'config.json'), JSON.stringify(test.config, null, 2), 'utf-8');
    }

    const cliArgs: string[] = [DIST_ENTRY];
    if (test.flags) cliArgs.push(...test.flags);
    if (test.model) { cliArgs.push('--model'); cliArgs.push(test.model); }
    if (test.prompt !== undefined) cliArgs.push('-p', test.prompt);
    else cliArgs.push('--script', inputFile);

    let stdout = '';
    let stderr = '';
    let exitCode: number;
    let trace: ToolTraceEvent[] = [];
    let fakeLlmTrace: FakeLlmTraceEvent[] = [];

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
        const child = spawn(process.execPath, cliArgs, {
          cwd: test.workspace === 'temp' ? tmpWorkspace : ROOT,
          env: {
            ...safeBaseEnv,
            FREECODE_HOME: tmpHome,
            FREECODE_STORE: tmpStore,
            DEBUG_QUOTA: '0',
            FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
            DOPPLER_PROJECT: '1',
            FREECODE_DB_SYNC_URL: '',
            FREECODE_DB_AUTH_TOKEN: '',
            ...(test.llmFixture
              ? { FREECODE_FAKE_LLM: '1', FREECODE_FAKE_LLM_SCRIPT: fakeFixturePath, FREECODE_FAKE_LLM_TRACE: fakeTraceFile }
              : { FREECODE_NO_LLM: '1' }),
            ...(test.expect.toolTrace ? { FREECODE_TRACE_JSON: traceFile } : {}),
            ...(test.env ?? {}),
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
      if (existsSync(fakeTraceFile)) {
        fakeLlmTrace = JSON.parse(readFileSync(fakeTraceFile, 'utf-8')) as FakeLlmTraceEvent[];
      }
    } catch (err) {
      stderr += `\nHarness error: ${err instanceof Error ? err.message : String(err)}`;
      exitCode = 1;
    }

    const workspaceRoot = test.workspace === 'temp' ? tmpWorkspace : ROOT;
    const failures = assertE2eExpectations({
      expect: test.expect,
      stdout,
      stderr,
      exitCode,
      trace,
      fakeLlmTrace,
      workspaceRoot,
      workspace: test.workspace ?? 'repo',
      env: test.env,
    });

    // Authoring aid for stdoutBlock, mirroring TTY_DUMP: never hand-write a
    // block from what the output is assumed to look like.
    if (E2E_DUMP) {
      console.log(`\n--- ${test.name} stdout (${outputRows(stdout).length} rows) ---`);
      outputRows(stdout).forEach((row, i) => console.log(`${String(i).padStart(3)} ${JSON.stringify(row)}`));
    }

    removeTempDir(tmpHome, 'tmpHome');
    removeTempDir(tmpStore, 'tmpStore');
    if (test.workspace === 'temp') removeTempDir(tmpWorkspace, 'tmpWorkspace');

    return { test, failures, stdout, stderr, exitCode, trace, fakeLlmTrace, ms: Date.now() - t0 };
  });

  for (const { test, failures, stdout, stderr, exitCode, trace, fakeLlmTrace, ms } of nonTtyResults) {
    e2eTimings.push({ name: test.name, type: 'verify', ms, ok: failures.length === 0 });
    if (showDetails) {
      const checks: string[] = [];
      if (test.expect.exitCode !== undefined) checks.push(`exitCode=${test.expect.exitCode}`);
      if (test.expect.stdoutContains?.length) checks.push(`stdoutContains=${test.expect.stdoutContains.length}`);
      if (test.expect.stdoutAbsent?.length) checks.push(`stdoutAbsent=${test.expect.stdoutAbsent.length}`);
      if (test.expect.stdoutOrder?.length) checks.push(`stdoutOrder=${test.expect.stdoutOrder.length}`);
      if (test.expect.files?.length) checks.push(`files=${test.expect.files.length}`);
      if (test.expect.toolTrace) checks.push('toolTrace');
      if (test.expect.fakeLlmTrace) checks.push('fakeLlmTrace');
      console.log(`\n  ${chalk.cyan('RUN')}   ${chalk.cyan(test.name)}`);
      console.log(`        ${chalk.dim(test.description || '(no description)')}`);
      console.log(`        type: ${chalk.yellow('e2e verification')} | workspace: ${chalk.magenta(test.workspace ?? 'repo')}`);
      console.log(`        checks: ${checks.length > 0 ? checks.join(', ') : chalk.dim('(none)')}`);
    }

    if (failures.length === 0) {
      if (showDetails) {
        const calls = trace.map(event => event.tool);
        console.log(`        exitCode: ${chalk.green(String(exitCode))}`);
        if (test.expect.files?.length) {
          console.log(`        file checks: ${test.expect.files.map(f => f.path).join(', ')}`);
        }
        if (test.expect.toolTrace) {
          console.log(`        tools: ${calls.join(' -> ') || '(none)'}`);
        }
        if (test.expect.fakeLlmTrace) {
          console.log(`        fake LLM calls: ${fakeLlmTrace.length}`);
        }
        printCapturedOutput(stdout, stderr);
      }
      passed++;
    } else {
      console.log(`  ${chalk.red('FAIL')}  ${chalk.cyan(test.name)}`);
      for (const f of failures) console.log(`          ${chalk.red(f)}`);
      if (showDetails || process.env.VERBOSE) {
        printCapturedOutput(stdout, stderr);
      }
      failed++;
    }
  }
}

if (timingJsonPath) {
  try {
    e2eTimings.sort((a, b) => b.ms - a.ms);
    writeFileSync(timingJsonPath, JSON.stringify({ tests: e2eTimings }, null, 2), 'utf-8');
  } catch (err) {
    console.error('[timing] failed to write e2e test timings:', err);
  }
}

if (failed > 0) {
  console.log('');
  console.log(chalk.red(`Results: ${passed} passed, ${failed} failed`));
}

process.exit(failed > 0 ? 1 : 0);
