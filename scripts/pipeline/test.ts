import { spawnSync } from 'child_process';
import { SECTIONS, useShell } from './pipeline.js';

const start = Date.now();

let exitCode = 0;
for (const { cmd, args } of SECTIONS) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: useShell });
  if (result.error) {
    console.error(`\nFailed to run ${cmd} ${args.join(' ')}: ${result.error.message}`);
    exitCode = 1;
    break;
  }
  exitCode = result.status ?? 1;
  if (exitCode !== 0) break;
}

const ms = Date.now() - start;
const totalSec = ms / 1000;
const m = Math.floor(totalSec / 60);
const s = (totalSec % 60).toFixed(1);
const label = m > 0 ? `${m}m ${s}s` : `${s}s`;
console.log(`\nTotal: ${label}`);

process.exit(exitCode);
