#!/usr/bin/env tsx
/**
 * Timed pipeline. The full run executes the identical sections that `npm test`
 * runs (shared from scripts/pipeline.ts — no drift in what runs or how), timing
 * each one. Scoping to a single section drills deeper.
 *
 * Depth follows scope: the wider the scope, the shallower the breakdown.
 *   - full run   → section totals only (coarse; find the slow section)
 *   - one section → per-file (unit) / per-scenario (scenarios) breakdown
 *   - one section + filter → deepest view (per-test, or per-phase for a scenario)
 *
 * Usage:
 *   npm run time                     → full suite (build→lint→docs→scenarios→unit)
 *   npm run time -- test             → same
 *   npm run time -- build            → just build
 *   npm run time -- lint             → just lint
 *   npm run time -- docs             → just docs
 *   npm run time -- scenarios        → scenarios, per-scenario breakdown
 *   npm run time -- scenarios <name> → one scenario, per-phase breakdown
 *   npm run time -- unit             → unit tests, per-file breakdown
 *   npm run time -- unit <pattern>   → matching unit files, per-test breakdown
 *   npm run time -- help             → this help
 */
import { spawnSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { SECTIONS, PTY_EXCLUDES, useShell, type PipelineSection } from './pipeline.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Types ─────────────────────────────────────────────────────────────────────

interface Section { label: string; ms: number; ok: boolean; children?: Section[]; }

// ── Help ────────────────────────────────────────────────────────────────────

const HELP = `Timed test pipeline. Depth of breakdown follows scope.

Usage: npm run time -- [scope] [filter]

Scopes:
  (none) | test       full suite, section totals only
  build | lint | docs  single section, wall-clock total
  scenarios | scenario per-scenario breakdown
  scenarios <name>     one scenario, per-phase breakdown
  unit                 per-file unit breakdown (sorted slowest-first)
  unit <pattern>       matching unit files, per-test breakdown
  help                 this message

Start with the full run to find the slow section, then re-run that section
(optionally with a filter) for the granular breakdown.`;

// ── Utils ─────────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
  if (ms >= 60_000) {
    const m = Math.floor(ms / 60_000);
    const s = ((ms % 60_000) / 1000).toFixed(1);
    return `${m}m ${s}s`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function exec(cmd: string, args: string[], quiet = false, env?: Record<string, string>): { ok: boolean; ms: number; out: string } {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    stdio: quiet ? 'pipe' : 'inherit',
    shell: useShell,
    cwd: ROOT,
    encoding: 'utf-8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  return {
    ok: !r.error && (r.status ?? 1) === 0,
    ms: Date.now() - t0,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
  };
}

// ── Report ────────────────────────────────────────────────────────────────────

function printReport(sections: Section[], skipSlowest = false): void {
  const flat: Array<{ path: string; ms: number; ok: boolean }> = [];
  function collect(s: Section): void {
    if (s.children?.length) {
      for (const c of s.children) collect(c);
    } else {
      flat.push({ path: s.label, ms: s.ms, ok: s.ok });
    }
  }
  for (const s of sections) collect(s);
  flat.sort((a, b) => b.ms - a.ms);

  console.log(chalk.bold('\n══ Timing Report ════════════════════════════════════════\n'));

  const termWidth = process.stdout.columns ?? 80;

  function tree(s: Section, depth = 0): void {
    const pad = '  '.repeat(depth);
    const icon = s.ok ? chalk.green('✓') : chalk.red('✗');
    const col = Math.max(4, 54 - depth * 2);
    // indent + "✓ " + " " + time (~7) — leave room so time doesn't wrap
    const maxLabelLen = Math.max(10, termWidth - depth * 2 - 2 - 8);
    const raw = s.label.length > maxLabelLen ? s.label.slice(0, maxLabelLen - 1) + '…' : s.label;
    const labelPadded = raw.padEnd(col);
    const label = s.ok ? labelPadded : chalk.red(labelPadded);
    console.log(`${pad}${icon} ${label} ${chalk.bold(fmt(s.ms))}`);
    for (const c of s.children ?? []) tree(c, depth + 1);
  }
  for (const s of sections) tree(s);

  if (!skipSlowest && flat.length > 1) {
    console.log(chalk.bold('\n── Slowest leaves ───────────────────────────────────────'));
    // "  XX. NNN.NNNs " prefix = 16 visible chars
    const maxPath = Math.max(20, termWidth - 16);
    for (const [i, e] of flat.slice(0, 15).entries()) {
      const rank = chalk.dim(`${String(i + 1).padStart(2)}.`);
      const time = chalk.yellow(fmt(e.ms).padEnd(9));
      const flag = e.ok ? '' : chalk.red(' ✗');
      const path = e.path.length > maxPath ? e.path.slice(0, maxPath - 1) + '…' : e.path;
      console.log(`  ${rank} ${time} ${path}${flag}`);
    }
  }

  const total = sections.reduce((a, s) => a + s.ms, 0);
  console.log(chalk.bold(`\nTotal: ${fmt(total)}\n`));
}

// ── Sections ──────────────────────────────────────────────────────────────────

// Run a section's command verbatim (as `npm test` runs it), timing the wall
// clock with no sub-breakdown. Used for the full run and for build/lint/docs.
function runSection(section: PipelineSection): Section {
  console.log(chalk.bold.blue(`\n▶  ${section.label}`));
  const r = exec(section.cmd, section.args);
  return { label: section.label, ms: r.ms, ok: r.ok };
}

interface PhaseTiming { label: string; ms: number; ok: boolean; }
interface ScenarioTiming { name: string; type: string; ms: number; ok: boolean; phases?: PhaseTiming[]; }

// Scenarios scoped on their own: per-scenario breakdown. With a filter, scope
// to that one scenario and surface the per-phase TTY timing (TTY_TIMING is set
// internally here — it is not a user-facing knob).
function runScenariosDeep(filter?: string): Section {
  console.log(chalk.bold.blue('\n▶  Scenarios'));
  const section = SECTIONS.find(s => s.key === 'scenarios')!;
  const jsonOut = join(tmpdir(), `scenario-timing-${Date.now()}.json`);
  const args = [...section.args];
  const env: Record<string, string> = { SCENARIO_TIMING_JSON: jsonOut };

  if (filter) {
    // `npm run verify:scenarios -- --only=<name>` narrows to one scenario;
    // TTY_TIMING makes the TTY harness print one timing line per phase.
    args.push('--', `--only=${filter}`);
    env.TTY_TIMING = '1';
  }

  const r = exec(section.cmd, args, false, env);

  const kids: Section[] = [];
  if (existsSync(jsonOut)) {
    try {
      const data = JSON.parse(readFileSync(jsonOut, 'utf-8')) as { scenarios: ScenarioTiming[] };
      for (const s of data.scenarios) {
        // When scoped to one scenario, nest its per-phase timings (startup →
        // each step → exit) as children, kept in chronological order so the
        // breakdown reads as a timeline rather than slowest-first.
        const phases = filter && s.phases?.length
          ? s.phases.map(p => ({ label: p.label, ms: p.ms, ok: p.ok }))
          : undefined;
        kids.push({ label: s.name, ms: s.ms, ok: s.ok, children: phases });
      }
      kids.sort((a, b) => b.ms - a.ms);
      try { unlinkSync(jsonOut); } catch { /* ignore */ }
    } catch { /* JSON parse failed; no per-scenario breakdown */ }
  }

  // The section's wall clock (r.ms) covers harness boot + teardown on top of the
  // measured scenario(s). Surface that gap explicitly so the children add up to
  // the parent total. Only when scoped to one scenario — a full run measures
  // scenarios in parallel, where the gap is meaningless.
  if (filter && kids.length > 0) {
    const overhead = r.ms - kids.reduce((a, k) => a + k.ms, 0);
    if (overhead > 0) kids.push({ label: 'harness startup + teardown', ms: overhead, ok: true });
  }

  return { label: 'scenarios', ms: r.ms, ok: r.ok, children: kids.length > 0 ? kids : undefined };
}

interface VitestAssertionResult {
  status: string;
  fullName: string;
  duration?: number;
}

interface VitestFileResult {
  name: string;
  startTime: number;
  endTime: number;
  status: string;
  assertionResults: VitestAssertionResult[];
}

function gatherTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...gatherTestFiles(full));
    else if (e.isFile() && e.name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function unitAliases(absPath: string): string[] {
  const rel = relative(ROOT, absPath);                      // tests/commands/model.test.ts
  const fromTests = rel.replace(/^tests\//, '');            // commands/model.test.ts
  const base = basename(absPath);                           // model.test.ts
  const strip = (p: string) => [p, p.replace(/\.ts$/, ''), p.replace(/\.test\.ts$/, '')];
  return [...new Set([...strip(rel), ...strip(fromTests), ...strip(base)])];
}

function resolveUnitFilter(filter: string): string {
  const files = gatherTestFiles(join(ROOT, 'tests'));
  const matches = files.filter(f => unitAliases(f).includes(filter));
  if (matches.length === 0) {
    console.error(chalk.red(`No test file found matching: ${filter}`));
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(chalk.red(`Ambiguous filter "${filter}" matches ${matches.length} files:`));
    for (const m of matches) console.error(`  ${relative(ROOT, m)}`);
    process.exit(1);
  }
  return matches[0];
}

// Unit tests scoped on their own: per-file breakdown. With a filter, vitest
// narrows to matching files and every test in them is shown (no >= 1s gate).
function runUnitDeep(filter?: string): Section {
  console.log(chalk.bold.blue('\n▶  Unit tests'));
  const jsonOut = join(tmpdir(), `vitest-timing-${Date.now()}.json`);

  // --reporter=json only: using two reporters via CLI triggers a vitest 4.x crash.
  const vitestArgs = ['vitest', 'run'];
  if (filter) vitestArgs.push(resolveUnitFilter(filter));
  vitestArgs.push('--reporter=json', `--outputFile=${jsonOut}`, ...PTY_EXCLUDES);
  const vitestR = exec('npx', vitestArgs, true);

  const kids: Section[] = [];
  let total = 0, passed = 0, failed = 0;
  // With a filter the user is drilling into specific files — show every test.
  // Without a filter, show only per-file totals (tree is already sorted).
  const perTestFloorMs = filter ? 0 : Infinity;

  if (existsSync(jsonOut)) {
    try {
      const data = JSON.parse(readFileSync(jsonOut, 'utf-8')) as {
        numTotalTests: number;
        numPassedTests: number;
        numFailedTests: number;
        testResults: VitestFileResult[];
      };
      total = data.numTotalTests ?? 0;
      passed = data.numPassedTests ?? 0;
      failed = data.numFailedTests ?? 0;

      for (const t of data.testResults) {
        const rel = relative(ROOT, t.name);
        const label = rel.startsWith('tests/') ? rel.slice('tests/'.length) : rel;
        const ms = t.endTime - t.startTime;
        const ok = t.status === 'passed';

        const testKids: Section[] = t.assertionResults
          .filter(a => typeof a.duration === 'number' && a.duration >= perTestFloorMs)
          .map(a => ({ label: a.fullName, ms: Math.round(a.duration!), ok: a.status === 'passed' }));

        testKids.sort((a, b) => b.ms - a.ms);
        kids.push({ label, ms, ok, children: testKids.length > 0 ? testKids : undefined });
      }
      kids.sort((a, b) => b.ms - a.ms);
      try { unlinkSync(jsonOut); } catch { /* ignore */ }
    } catch { /* JSON parse failed; no per-file breakdown */ }
  }

  const summary = failed > 0
    ? chalk.red(`${passed} passed, ${failed} failed / ${total} total`)
    : chalk.green(`${passed} passed / ${total} total`);
  console.log(`\n  ${summary}`);

  return {
    label: 'unit tests',
    ms: vitestR.ms,
    ok: vitestR.ok,
    children: kids.length > 0 ? kids : undefined,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const raw = process.argv[2] ?? 'test';
const scope = raw === 'scenario' ? 'scenarios' : raw;
const filter = process.argv[3];

if (scope === 'help' || scope === '--help' || scope === '-h') {
  console.log(HELP);
  process.exit(0);
}

const sections: Section[] = [];

function pushOrBail(s: Section, bail: boolean): void {
  sections.push(s);
  if (!s.ok) {
    printReport(sections);
    if (bail) process.exit(1);
  }
}

switch (scope) {
  case 'test':
    for (const section of SECTIONS) pushOrBail(runSection(section), true);
    break;
  case 'build':
  case 'lint':
  case 'docs':
    sections.push(runSection(SECTIONS.find(s => s.key === scope)!));
    break;
  case 'scenarios': sections.push(runScenariosDeep(filter)); break;
  case 'unit':      sections.push(runUnitDeep(filter));      break;
  default:
    console.error(`Unknown scope: ${scope}\n`);
    console.error(HELP);
    process.exit(1);
}

const skipSlowest = scope === 'unit' || (scope === 'scenarios' && !filter);
printReport(sections, skipSlowest);
if (sections.some(s => !s.ok)) process.exit(1);
