// Credential setup for a sweep process.
//
// Mirrors src/index.ts's boot sequence, and must run before any src provider
// module is imported: some provider config (e.g. Cloudflare's baseUrl) reads env
// vars at module-evaluation time, so a late injection is a silently different
// run. A sweep entry point therefore does its src imports dynamically, after
// calling prepareSweepEnv().
//
// Sweeps are free-only, unconditionally. A sweep is one call per unit across a
// whole tree, which is precisely where an accidental paid model stops being one
// mistake and becomes a hundred — the same reasoning that makes `freecode -p`
// free-only. paid-guard.ts is an import-free leaf for this exact use.

import { spawnSync } from 'child_process';
import { FREE_ONLY_ENV_VAR, isPaidApiKeyEnvVar } from '../../src/providers/paid-guard.js';

function tryInjectDoppler(): void {
  if (process.env['DOPPLER_PROJECT']) return;
  const result = spawnSync('doppler', ['secrets', 'download', '--format=json', '--no-file'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return;
  try {
    const secrets = JSON.parse(result.stdout) as Record<string, string>;
    for (const [key, value] of Object.entries(secrets)) {
      // Skipped rather than deleted after the fact, so a billable credential is
      // never in the process at all — same rule as src/index.ts.
      if (isPaidApiKeyEnvVar(key)) continue;
      process.env[key] = value;
    }
  } catch {
    // ignore parse errors
  }
}

/** Sets free-only mode, then loads non-paid credentials. Call before importing src/. */
export function prepareSweepEnv(): void {
  process.env[FREE_ONLY_ENV_VAR] = '1';
  tryInjectDoppler();
}
