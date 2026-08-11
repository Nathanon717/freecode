import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ENTRY = join(import.meta.dirname, '../dist/index.js');

// Each spawned process gets its own temp store + home so it never reads or
// mutates the committed .freecode/freecode.db or ~/.config/freecode/config.json.
let tempStore = '';
let tempHome = '';

beforeEach(() => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-cli-store-'));
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-cli-home-'));
});

afterEach(() => {
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS will clean up */ }
  try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

function run(args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [ENTRY, ...args], {
    // index.js validates arguments before importing its runtime graph, so these
    // invalid-arg cases exit in well under a second. The generous timeout is a
    // safety net for CPU contention during full-parallel `npm test`, not part of
    // the expected path — a hit here means startup regressed to eager-importing
    // the heavy `ai` SDK / libSQL graph before validation again.
    timeout: 15000,
    encoding: 'utf8',
    env: {
      ...process.env,
      DOPPLER_PROJECT: '1',
      FREECODE_STORE: tempStore,
      FREECODE_HOME: tempHome,
      FREECODE_DB_SYNC_URL: '',
      FREECODE_DB_AUTH_TOKEN: '',
      ...env,
    },
  });
}

describe('CLI argument validation', () => {
  it('exits 1: --model missing argument', () => {
    const result = run(['--model']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--model requires a provider:model argument');
  });

  it('exits 1: --script missing argument', () => {
    const result = run(['--script']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--script requires a file path argument');
  });

  it('exits 1: --script path not found', () => {
    const result = run(['--script', '/nonexistent/path/to/script.txt']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error reading script file');
  });

  // The reported failure: every one of these three tokens was silently discarded, and the
  // turn ran with the literal prompt "--stats" on the default model, printing a
  // plausible-looking answer. Whichever check fires first, the run must not start.
  it('exits 1: the whole misordered command that used to run silently', () => {
    const result = run(['-p', '--stats', '-m', 'zen:big-pickle', 'what does this repo do']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('-p requires a prompt argument');
    expect(result.stderr).toContain('--stats');
  });

  // Every rejection message is pinned in tests/cli/args.test.ts; what a spawn adds is that
  // the process actually exits on one. The accepted case below is the same in reverse.
  //
  // Rejection is on the flag table, not on a leading `-`, so a prompt that opens with a
  // dash is still a prompt. FREECODE_NO_LLM makes the accepted run exit without a provider.
  it('accepts a prompt that starts with a dash', () => {
    const result = run(['-p', '--stats is what? explain', '--stats'], { FREECODE_NO_LLM: '1' });
    expect(result.stderr).not.toContain('requires a prompt argument');
    expect(result.stderr).not.toContain('Unknown flag');
    expect(result.stderr).not.toContain('Unexpected argument');
  });
});
