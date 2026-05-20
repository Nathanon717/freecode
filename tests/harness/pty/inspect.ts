#!/usr/bin/env tsx
// Ad-hoc TUI inspector: run a one-off interaction sequence through a real PTY
// and print the rendered screen after each step.
//
// Usage:
//   npm run inspect:tty -- '<json>'
//   npm run inspect:tty -- path/to/steps.json
//
// JSON shape is identical to the `tty` block in scenario files:
//   '{"steps":[{"name":"open model picker","send":"/model\r"}]}'
//
// Steps also accept screenContains/screenAbsent for inline assertion output.
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { createPtyDriver } from './driver.js';
import type { TtyScenario } from './run-tty-scenario.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DIST_ENTRY = join(ROOT, 'dist', 'index.js');

function parseArg(arg: string): TtyScenario {
  if (existsSync(arg)) return JSON.parse(readFileSync(arg, 'utf8'));
  return JSON.parse(arg);
}

function show(label: string, lines: string[], cols: number): void {
  const bar = '-'.repeat(cols);
  console.log(`\n=== ${label} ===\n${bar}\n${lines.join('\n')}\n${bar}`);
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      'Usage: npm run inspect:tty -- \'{"steps":[{"name":"...", "send":"..."}]}\'\n' +
      '       npm run inspect:tty -- path/to/steps.json',
    );
    process.exit(1);
  }

  let scenario: TtyScenario;
  try {
    scenario = parseArg(arg);
  } catch (e) {
    console.error('Could not parse scenario (expected JSON string or file path):', e);
    process.exit(1);
  }

  const cols = scenario.cols ?? 80;
  const rows = scenario.rows ?? 24;

  const driver = createPtyDriver({
    command: process.execPath,
    args: [DIST_ENTRY],
    cwd: ROOT,
    env: {
      ...process.env,
      FREECODE_HOME: mkdtempSync(join(tmpdir(), 'freecode-inspect-')),
      FORCE_COLOR: '1',
    },
    cols,
    rows,
  });

  try {
    const readyText = scenario.readyText ?? 'for commands';
    const ready = await driver.waitForText(readyText, 15000);
    if (!ready) {
      console.error(`Prompt never became ready (waited for ${JSON.stringify(readyText)})`);
      process.exitCode = 1;
      return;
    }
    await driver.settle(400);
    show('startup', driver.snapshot(), cols);

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const label = step.name ?? `step ${i + 1}`;

      if (step.send) driver.send(step.send);
      if (step.waitFor) await driver.waitForText(step.waitFor, 8000);
      await driver.settle(step.quietMs ?? 350);

      const lines = driver.snapshot();
      show(label, lines, cols);

      if (step.screenContains?.length || step.screenAbsent?.length) {
        const screen = lines.join('\n');
        for (const needle of step.screenContains ?? []) {
          console.log(`  ${screen.includes(needle) ? '✓' : '✗'} contains: ${JSON.stringify(needle)}`);
        }
        for (const needle of step.screenAbsent ?? []) {
          console.log(`  ${!screen.includes(needle) ? '✓' : '✗'} absent:   ${JSON.stringify(needle)}`);
        }
      }
    }

    driver.send(scenario.exit ?? '');
    await driver.waitExit(5000);
    console.log('\nexited with code', driver.exitCode());
  } finally {
    driver.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
