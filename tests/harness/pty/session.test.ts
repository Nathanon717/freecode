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
  // Shared across tests in document order — each test advances the session state.
  let sessionId: string | null = null;

  afterAll(() => {
    if (sessionId) {
      runSession(['stop', sessionId]);
      sessionId = null;
    }
  });

  it('start spawns a daemon, prints SESSION_ID and initial screen', () => {
    const { stdout, exitCode } = runSession(['start']);
    expect(exitCode, `start exited non-zero`).toBe(0);

    const idLine = stdout.split('\n').find(l => l.startsWith('SESSION_ID='));
    expect(idLine, 'SESSION_ID line missing from start output').toBeDefined();

    sessionId = idLine!.slice('SESSION_ID='.length).trim();
    expect(sessionId).toMatch(/^[0-9a-f]{12}$/, 'SESSION_ID should be 12 hex chars');

    // The initial screen should contain the interactive prompt
    expect(stdout).toContain('for commands');
  }, 35000);

  it('screen returns the current rendered screen without altering state', () => {
    expect(sessionId, 'depends on start test').toBeTruthy();
    const { stdout, exitCode } = runSession(['screen', sessionId!]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('for commands');
  }, 15000);

  it('send delivers keystrokes and returns updated screen', () => {
    expect(sessionId, 'depends on start test').toBeTruthy();
    // Typing "/" opens the autocomplete suggestion list
    const { stdout, exitCode } = runSession(['send', sessionId!, '/']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('/clear');
  }, 15000);

  it('send escape resets the prompt', () => {
    expect(sessionId, 'depends on previous send test').toBeTruthy();
    // ESC clears the current input
    const { stdout, exitCode } = runSession(['send', sessionId!, '\x1b']);
    expect(exitCode).toBe(0);
    // After escape, autocomplete list should be gone and base prompt back
    expect(stdout).toContain('for commands');
  }, 15000);

  it('stop terminates the session and prints "stopped"', () => {
    expect(sessionId, 'depends on start test').toBeTruthy();
    const { stdout, exitCode } = runSession(['stop', sessionId!]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('stopped');
    sessionId = null;
  }, 15000);
});
