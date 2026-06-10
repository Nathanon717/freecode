import { spawnSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ENTRY = join(import.meta.dirname, '../dist/index.js');

function run(args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [ENTRY, ...args], {
    timeout: 5000,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe('CLI argument validation', () => {
  it('exits 1 and reports error when --model is missing its argument', () => {
    const result = run(['--model']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--model requires a provider:model argument');
  });

  it('exits 1 and reports error when --script is missing its argument', () => {
    const result = run(['--script']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--script requires a file path argument');
  });

  it('exits 1 when --script path does not exist', () => {
    const result = run(['--script', '/nonexistent/path/to/script.txt']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error reading script file');
  });
});
