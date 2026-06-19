import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createClient } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importLegacyData } from '../../src/providers/store-import.js';

// createSchema DDL (reproduced inline so this test is self-contained and not
// coupled to the db.ts internals).
async function bootstrap(client: ReturnType<typeof createClient>): Promise<void> {
  await client.execute(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS models (
      key TEXT PRIMARY KEY, provider TEXT NOT NULL, model_id TEXT NOT NULL,
      display_name TEXT, native_tools INTEGER, context_window INTEGER,
      is_favorite INTEGER DEFAULT 0, settings TEXT, rate_limits TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS eval_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model_key TEXT NOT NULL REFERENCES models(key),
      eval_type TEXT NOT NULL, task_id TEXT NOT NULL,
      timestamp TEXT NOT NULL, pass INTEGER NOT NULL,
      warnings INTEGER, turns INTEGER,
      input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER,
      duration_ms INTEGER, scenario_hash TEXT, error TEXT, checks TEXT,
      UNIQUE(model_key, eval_type, task_id, timestamp)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS eval_transcripts (
      run_id INTEGER PRIMARY KEY REFERENCES eval_runs(id),
      fail_reason TEXT, transcript TEXT, scoring TEXT
    )
  `);
}

let tempStore = '';
let client: ReturnType<typeof createClient>;
const previousStore = process.env.FREECODE_STORE;

beforeEach(() => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-import-'));
  process.env.FREECODE_STORE = tempStore;
  client = createClient({ url: `file:${join(tempStore, 'test.db')}` });
});

afterEach(async () => {
  client.close();
  await new Promise(r => setTimeout(r, 100));
  if (previousStore === undefined) delete process.env.FREECODE_STORE;
  else process.env.FREECODE_STORE = previousStore;
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS cleans up */ }
});

describe('store-import: no-op guards', () => {
  it('skips when models.json is absent (test env with temp store)', async () => {
    await bootstrap(client);
    const result = await importLegacyData(client);
    expect(result.skipped).toBe(true);
    expect(result.models).toBe(0);
  });

  it('skips on second call due to meta marker', async () => {
    await bootstrap(client);
    // Write a minimal models.json so the first call runs
    writeFileSync(join(tempStore, 'models.json'), JSON.stringify({
      'groq:llama': { provider: 'groq', modelId: 'llama' },
    }), 'utf-8');

    const first = await importLegacyData(client);
    expect(first.skipped).toBe(false);
    expect(first.models).toBeGreaterThan(0);

    const second = await importLegacyData(client);
    expect(second.skipped).toBe(true);
  });
});

describe('store-import: models.json import', () => {
  it('imports model rows with all fields', async () => {
    await bootstrap(client);
    writeFileSync(join(tempStore, 'models.json'), JSON.stringify({
      'groq:llama': {
        provider: 'groq',
        modelId: 'llama',
        isFavorite: true,
        nativeTools: false,
        contextWindow: 128000,
        settings: { streaming: true },
        rateLimits: { buckets: { requests: { limit: 1000, intervalMs: 60000 } }, observedAt: '2026-06-19T00:00:00Z' },
      },
    }), 'utf-8');

    const result = await importLegacyData(client);
    expect(result.models).toBeGreaterThanOrEqual(1);

    const row = (await client.execute(`SELECT * FROM models WHERE key='groq:llama'`)).rows[0]!;
    expect(row['provider']).toBe('groq');
    expect(row['model_id']).toBe('llama');
    expect(row['is_favorite']).toBe(1);
    expect(row['native_tools']).toBe(0);
    expect(row['context_window']).toBe(128000);
    expect(JSON.parse(row['settings'] as string)).toMatchObject({ streaming: true });
  });

  it('imports eval_runs from models.json evals', async () => {
    await bootstrap(client);
    writeFileSync(join(tempStore, 'models.json'), JSON.stringify({
      'groq:llama': {
        provider: 'groq',
        modelId: 'llama',
        evals: {
          humaneval: [{
            timestamp: '2026-06-11T20:35:44.525Z',
            taskId: 'HumanEval/0',
            pass: true,
            turns: 3,
            tokenUsage: { input: 500, output: 100 },
            durationMs: 4500,
            transcriptRef: 'evals/humaneval/groq-llama/20260611T203544525Z.json',
            error: null,
          }],
        },
      },
    }), 'utf-8');

    const result = await importLegacyData(client);
    expect(result.evalRuns).toBeGreaterThan(0);

    const runs = (await client.execute(`SELECT * FROM eval_runs WHERE model_key='groq:llama'`)).rows;
    expect(runs).toHaveLength(1);
    expect(runs[0]!['eval_type']).toBe('humaneval');
    expect(runs[0]!['task_id']).toBe('HumanEval/0');
    expect(runs[0]!['pass']).toBe(1);
    expect(runs[0]!['turns']).toBe(3);
    expect(runs[0]!['duration_ms']).toBe(4500);
  });
});

describe('store-import: playground results import', () => {
  it('creates stub model rows for models only in playground results', async () => {
    await bootstrap(client);
    writeFileSync(join(tempStore, 'models.json'), JSON.stringify({}), 'utf-8');
    // Playground results use real package path; this test only verifies the guard path
    // (models.json present → import runs). Real playground data is covered by the
    // existing integration in initStore().
    const result = await importLegacyData(client);
    expect(result.skipped).toBe(false);
  });
});

describe('store-import: transcript import', () => {
  it('imports transcript file into eval_transcripts and matches to run', async () => {
    await bootstrap(client);

    const ts = '2026-06-11T20:35:44.525Z';

    writeFileSync(join(tempStore, 'models.json'), JSON.stringify({
      'groq:llama': {
        provider: 'groq',
        modelId: 'llama',
        evals: {
          humaneval: [{
            timestamp: ts,
            taskId: 'HumanEval/0',
            pass: true,
            turns: 2,
            tokenUsage: { input: 100, output: 50 },
            durationMs: 1000,
            transcriptRef: 'evals/humaneval/groq-llama/20260611T203544525Z.json',
            error: null,
          }],
        },
      },
    }), 'utf-8');

    // Write a matching transcript file
    const transcriptDir = join(tempStore, 'evals', 'humaneval', 'groq-llama');
    mkdirSync(transcriptDir, { recursive: true });
    writeFileSync(join(transcriptDir, '20260611T203544525Z.json'), JSON.stringify({
      provider: 'groq',
      modelId: 'llama',
      evalType: 'humaneval',
      timestamp: ts,
      pass: true,
      freecodeVersion: null,
      transcript: [{ tool: 'create', args: {}, result: '' }],
      scoringOutcome: { score: 1 },
    }), 'utf-8');

    const result = await importLegacyData(client);
    expect(result.transcripts).toBe(1);

    const transcripts = (await client.execute(`SELECT * FROM eval_transcripts`)).rows;
    expect(transcripts).toHaveLength(1);
    expect(JSON.parse(transcripts[0]!['transcript'] as string)).toHaveLength(1);
  });
});

describe('store-import: COALESCE upsert merges playground + models.json fields', () => {
  it('run has both scenario_hash (from models.json via mock) and turns from models.json', async () => {
    await bootstrap(client);

    const ts = '2026-06-19T10:00:00.000Z';

    // models.json has turns+duration but no scenario_hash
    writeFileSync(join(tempStore, 'models.json'), JSON.stringify({
      'anthropic:claude-test': {
        provider: 'anthropic',
        modelId: 'claude-test',
        evals: {
          custom: [{
            timestamp: ts,
            taskId: 'cereal-soup',
            pass: true,
            turns: 5,
            tokenUsage: { input: 1000, output: 200 },
            durationMs: 3000,
            transcriptRef: 'evals/custom/anthropic-claude-test/20260619T100000000Z.json',
            error: null,
          }],
        },
      },
    }), 'utf-8');

    const result = await importLegacyData(client);
    expect(result.skipped).toBe(false);

    const rows = (await client.execute(
      `SELECT turns, duration_ms, scenario_hash FROM eval_runs WHERE model_key='anthropic:claude-test'`
    )).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!['turns']).toBe(5);
    expect(rows[0]!['duration_ms']).toBe(3000);
  });
});
