import { spawnSync } from 'child_process';
import { SECTIONS, useShell } from './pipeline.js';

const start = Date.now();

let exitCode = 0;
for (const [index, { label, cmd, args }] of SECTIONS.entries()) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: useShell });
  if (result.error) {
    console.error(`\nFailed to run ${cmd} ${args.join(' ')}: ${result.error.message}`);
    exitCode = 1;
  } else if (result.signal) {
    // A section killed by a signal (a native crash, or Ctrl-C) never printed its own
    // summary, so without this line the pipeline stops after a section that looks like
    // it passed — indistinguishable from that section having been dropped entirely.
    console.error(`\n${label} was terminated by signal ${result.signal} before it finished.`);
    exitCode = 1;
  } else {
    exitCode = result.status ?? 1;
  }

  if (exitCode !== 0) {
    // Name the failing section and what never ran. A bare stop reads as "those sections
    // are no longer part of npm test", which is the wrong conclusion to hand someone.
    // ASCII only: this is the one message that has to survive a classic cmd.exe
    // codepage, which is exactly where a stalled pipeline gets misread.
    console.error(`\nFAILED: ${label} (exit ${exitCode}) - stopping.`);
    const skipped = SECTIONS.slice(index + 1).map((s) => s.label);
    if (skipped.length) console.error(`  Not run: ${skipped.join(', ')}.`);
    break;
  }
}

const ms = Date.now() - start;
const totalSec = ms / 1000;
const m = Math.floor(totalSec / 60);
const s = (totalSec % 60).toFixed(1);
const label = m > 0 ? `${m}m ${s}s` : `${s}s`;
console.log(`\nTotal: ${label}`);

process.exit(exitCode);
