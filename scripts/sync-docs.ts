#!/usr/bin/env tsx
import { spawnSync } from 'child_process';

function run(args: string[], stdio: 'inherit' | 'pipe' = 'inherit') {
  const result = spawnSync(process.execPath, args, {
    stdio,
    encoding: 'utf-8',
    shell: false,
  });

  if (result.error) {
    console.error(result.error.message);
    return { status: 1, output: result.error.message };
  }

  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function runRequired(args: string[]): void {
  const { status } = run(args);
  if (status !== 0) {
    process.exit(status);
  }
}

const generateArgs = ['--import', 'tsx', 'scripts/generate-docs.ts'];
const check = run([...generateArgs, '--check'], 'pipe');

if (check.status === 0) {
  console.log('Generated docs are already current.');
} else if (check.output.includes('Generated docs are stale:')) {
  console.log('Generated docs are stale; regenerating.');
  runRequired(generateArgs);
} else {
  process.stderr.write(check.output);
  process.exit(check.status);
}

runRequired(['--import', 'tsx', 'scripts/check-map.ts']);
