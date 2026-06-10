import { spawnSync } from 'child_process';

const start = Date.now();
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps: [string, string[]][] = [
  [npm, ['run', 'build']],
  [npm, ['run', 'docs:generate']],
  [npm, ['run', 'verify:scenarios']],
  ['npx', ['vitest', 'run', '--reporter=dot',
    '--exclude', 'tests/harness/pty/driver.test.ts',
    '--exclude', 'tests/harness/pty/session.test.ts']],
];

// On Windows, npm/npx are .cmd batch scripts that cannot be spawned without a
// shell; on Linux they are real executables. spawnSync swallows the spawn error
// here, so without this the pipeline exits 0.0s having run nothing.
const useShell = process.platform === 'win32';

let exitCode = 0;
for (const [cmd, args] of steps) {
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
