import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Same temp-store + dynamic-import setup as model-data.test.ts: the modules resolve
// their store dir from $FREECODE_STORE at import time, so the env var is set first and
// the DB is opened against a fresh temp file per test.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let purge: typeof import('../../src/providers/blocklist-purge.js');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let store: typeof import('../../src/providers/model-data.js');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let db: typeof import('../../src/store/db.js');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let catalog: typeof import('../../src/providers/provider-catalog.js');
let tempStore = '';
const previousStore = process.env.FREECODE_STORE;

// The blocklists under test are real registry config, so the test provider's entry is
// mutated in place and restored afterwards rather than asserting on shipped values.
let restoreEntry: (() => void) | undefined;

function blocklistFor(providerId: string, substrings: string[], exact: string[]): void {
  const entry = catalog.PROVIDER_REGISTRY.find((p) => p.id === providerId)!;
  const prevSubstrings = entry.modelIdBlocklist;
  const prevExact = entry.modelIdExactBlocklist;
  entry.modelIdBlocklist = substrings;
  entry.modelIdExactBlocklist = exact;
  restoreEntry = () => {
    entry.modelIdBlocklist = prevSubstrings;
    entry.modelIdExactBlocklist = prevExact;
  };
}

beforeEach(async () => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-blocklist-'));
  process.env.FREECODE_STORE = tempStore;
  purge = await import('../../src/providers/blocklist-purge.js');
  store = await import('../../src/providers/model-data.js');
  db = await import('../../src/store/db.js');
  catalog = await import('../../src/providers/provider-catalog.js');
  await db.initStore();
});

afterEach(async () => {
  restoreEntry?.();
  restoreEntry = undefined;
  await db.resetStore();
  if (previousStore === undefined) delete process.env.FREECODE_STORE;
  else process.env.FREECODE_STORE = previousStore;
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

describe('blocklist-purge: detection', () => {
  it('finds nothing when no stored model matches a blocklist', () => {
    blocklistFor('groq', ['embed'], []);
    store.saveProviderCatalog('groq', [{ modelId: 'llama-4', displayName: 'Llama 4' }]);
    expect(purge.findBlocklistedStoredModels()).toEqual([]);
  });

  it('matches substring and exact blocklists, and leaves other models alone', () => {
    blocklistFor('groq', ['embed'], ['chat-latest']);
    store.saveProviderCatalog('groq', [
      { modelId: 'llama-4', displayName: 'Llama 4' },
      { modelId: 'text-embed-3', displayName: 'Embed 3' },
      { modelId: 'chat-latest', displayName: 'Chat Latest' },
    ]);

    expect(purge.findBlocklistedStoredModels().map((m) => m.key)).toEqual([
      'groq:chat-latest',
      'groq:text-embed-3',
    ]);
  });

  it('does not match an exact-blocklist id as a substring of another model', () => {
    blocklistFor('groq', [], ['chat']);
    store.saveProviderCatalog('groq', [{ modelId: 'chat-latest', displayName: 'Chat Latest' }]);
    expect(purge.findBlocklistedStoredModels()).toEqual([]);
  });

  it('scopes matches to the provider that declares the blocklist', () => {
    blocklistFor('groq', ['embed'], []);
    store.saveProviderCatalog('cerebras', [{ modelId: 'text-embed-3', displayName: 'Embed 3' }]);
    expect(purge.findBlocklistedStoredModels()).toEqual([]);
  });

  it('reports the stored display name so the confirmation can name the model', () => {
    blocklistFor('groq', ['embed'], []);
    store.saveProviderCatalog('groq', [{ modelId: 'text-embed-3', displayName: 'Embed 3' }]);
    expect(purge.findBlocklistedStoredModels()[0]).toMatchObject({
      provider: 'groq',
      modelId: 'text-embed-3',
      displayName: 'Embed 3',
    });
  });
});

describe('blocklist-purge: cascade delete', () => {
  it('deletes the model row plus its evals, transcripts, and call log, keeping other models', async () => {
    blocklistFor('groq', ['embed'], []);
    store.saveProviderCatalog('groq', [
      { modelId: 'text-embed-3', displayName: 'Embed 3' },
      { modelId: 'llama-4', displayName: 'Llama 4' },
    ]);
    store.setFavorite('groq:text-embed-3', true);
    store.appendEvalRun(
      'groq:text-embed-3',
      'humaneval',
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        taskId: 'task/0',
        pass: true,
        turns: 1,
        tokenUsage: { input: 10, output: 5 },
        durationMs: 100,
        error: null,
      },
      { pass: true, freecodeVersion: null, transcript: [{ role: 'user' }], scoringOutcome: null },
    );
    db.persistCallLogAsync({
      modelKey: 'groq:text-embed-3',
      timestamp: '2026-01-01T00:00:00.000Z',
      status: 200,
    });
    await db.drainPendingWrites();

    // Guards the post-delete assertions below from passing vacuously.
    expect(await db.queryRawForTesting('SELECT run_id FROM eval_transcripts')).toHaveLength(1);
    expect(await db.queryRawForTesting('SELECT id FROM llm_calls')).toHaveLength(1);

    await purge.purgeBlocklistedStoredModels(purge.findBlocklistedStoredModels());

    // Reload from disk: the delete must have hit the DB, not just the in-memory cache.
    await db.resetStore();
    await db.initStore();

    expect(db.getModelData()?.['groq:text-embed-3']).toBeUndefined();
    expect(db.getModelData()?.['groq:llama-4']).toBeDefined();
    expect(await db.queryRawForTesting('SELECT id FROM eval_runs WHERE model_key = ?', ['groq:text-embed-3'])).toEqual([]);
    expect(await db.queryRawForTesting('SELECT run_id FROM eval_transcripts')).toEqual([]);
    expect(await db.queryRawForTesting('SELECT id FROM llm_calls WHERE model_key = ?', ['groq:text-embed-3'])).toEqual([]);
  });

  it('is a no-op for an empty list', async () => {
    store.saveProviderCatalog('groq', [{ modelId: 'llama-4', displayName: 'Llama 4' }]);
    await db.drainPendingWrites();
    await purge.purgeBlocklistedStoredModels([]);
    expect(db.getModelData()?.['groq:llama-4']).toBeDefined();
  });
});
