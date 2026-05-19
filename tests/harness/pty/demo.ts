#!/usr/bin/env tsx
// Manual inspection tool: drive the real interactive CLI through a PTY and
// print the rendered screen after each keystroke sequence. Use it to "see"
// the live TUI on demand.
//
//   npx tsx tests/harness/pty/demo.ts
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { createPtyDriver } from './driver.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DIST_ENTRY = join(ROOT, 'dist', 'index.js');
const COLS = 80;

function show(label: string, lines: string[]): void {
  const bar = '-'.repeat(COLS);
  console.log(`\n=== ${label} ===\n${bar}\n${lines.join('\n')}\n${bar}`);
}

async function main() {
  const driver = createPtyDriver({
    command: process.execPath,
    args: [DIST_ENTRY],
    cwd: ROOT,
    env: { ...process.env, FREECODE_HOME: mkdtempSync(join(tmpdir(), 'freecode-pty-')), FORCE_COLOR: '1' },
    cols: COLS,
    rows: 24,
  });

  await driver.waitForText('for commands', 15000);
  await driver.settle(400);
  show('startup', driver.snapshot());

  driver.send('/');
  await driver.settle();
  show('typed "/"', driver.snapshot());

  driver.send('cle');
  await driver.settle();
  show('typed "/cle"', driver.snapshot());

  driver.send('\t');
  await driver.settle();
  show('tab -> "/clear"', driver.snapshot());

  driver.send('\r');
  await driver.settle(500);
  show('enter', driver.snapshot());

  driver.send('\u0003');
  await driver.waitExit(4000);
  console.log('\nchild exited:', driver.isExited(), 'code:', driver.exitCode());
  driver.kill();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
