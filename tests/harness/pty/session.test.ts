// check-tests: orphan

/**
 * Integration tests for the PTY session manager CLI (session.ts).
 *
 * These tests exercise the full TCP daemon + RPC round-trip: start → screen →
 * send → stop. They are skipped automatically when dist/index.js is absent (i.e.
 * freecode hasn't been built yet). Run `npm run build` first, then `npm run unit`.
 *
 * Tests run sequentially and share a single session — each test depends on the
 * previous one having left the session in the expected state.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DIST_ENTRY = join(ROOT, 'dist', 'index.js');
const SESSION_SCRIPT = join(__dirname, 'session.ts');
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const hasDist = existsSync(DIST_ENTRY);

interface SessionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runSession(args: string[]): SessionResult {
  const result = spawnSync(process.execPath, [TSX, SESSION_SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 35_000,
    env: { ...process.env, MSYS_NO_PATHCONV: '1', FORCE_COLOR: '0' },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? -1,
  };
}

describe.skipIf(!hasDist)('PTY session manager', () => {
  afterAll(() => {
    runSession(['stop']);
  });

  it('start spawns a daemon and prints initial screen', () => {
    const { stdout, exitCode } = runSession(['start', '--screen']);
    expect(exitCode, 'start exited non-zero').toBe(0);
    expect(stdout).toContain('for commands');
  }, 35000);

  it('screen returns the current rendered screen without altering state', () => {
    const { stdout, exitCode } = runSession(['screen']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('for commands');
  }, 15000);

  it('send delivers keystrokes and returns updated screen', () => {
    // Typing "/" opens the autocomplete suggestion list
    const { stdout, exitCode } = runSession(['send', '/']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('/clear');
  }, 15000);

  it('send escape resets the prompt', () => {
    // ESC clears the current input
    const { stdout, exitCode } = runSession(['send', '\x1b']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('for commands');
  }, 15000);

  it('stop terminates the session and prints "stopped"', () => {
    const { stdout, exitCode } = runSession(['stop']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('stopped');
  }, 15000);
});
