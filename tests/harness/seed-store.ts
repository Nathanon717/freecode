import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CHILD_SCRIPT = join(__dirname, 'seed-store-child.ts');

/** One model row an e2e test wants present in its temp store before the CLI starts. */
export interface SeedModel {
  provider: string;
  modelId: string;
  displayName?: string;
}

/**
 * Write model rows into an e2e test's temp store before the CLI is spawned.
 *
 * E2e tests normally start from an empty DB, which is fine because the CLI creates
 * whatever rows it needs. Startup behaviour that keys off *pre-existing* rows (the
 * blocklist purge prompt) can't be reached that way, so those tests seed here.
 * Uses the real schema so the seeded DB matches what the CLI opens.
 *
 * The write runs in a child process (`seed-store-child.ts`). A libSQL client holds
 * the db file open past `close()` — every prepared statement, including the
 * `SELECT 1` probe `createClient` itself issues, pins the handle until GC — so
 * seeding in-process left the harness unable to `rmSync` the temp store on
 * Windows. Process exit releases it unconditionally. See docs/bug log/29-07-2026d.md.
 */
export function seedModels(storeDir: string, models: SeedModel[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', CHILD_SCRIPT, storeDir, JSON.stringify(models)],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', reject);
    // Strict on purpose: a test that seeds and doesn't get its rows is asserting
    // against the wrong premise, so surface it rather than run on. A signal kill
    // reports `code === null`, hence the signal in the message.
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`seed-store child exited ${code ?? signal}: ${stderr.trim() || '(no output)'}`));
    });
  });
}
