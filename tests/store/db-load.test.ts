import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSchema } from '../../src/store/db-schema.js';
import { loadConfigFromDb, loadFromDb } from '../../src/store/db-load.js';

// Hydration is pure — it takes a client and returns plain data — so these tests open
// their own throwaway DB rather than going through db.ts's module-level singleton.
let client: Client;
let tempDir = '';

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'freecode-db-load-'));
  client = createClient({ url: `file:${join(tempDir, 'test.db')}` });
  await createSchema(client);
});

afterEach(() => {
  client.close();
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

async function insertModel(key: string, columns: Record<string, unknown> = {}): Promise<void> {
  const [provider, modelId] = key.split(':');
  const names = ['key', 'provider', 'model_id', ...Object.keys(columns)];
  await client.execute({
    sql: `INSERT INTO models (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
    args: [key, provider, modelId, ...Object.values(columns)] as never,
  });
}

async function insertEvalRun(modelKey: string, taskId: string): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO eval_runs (model_key, eval_type, task_id, timestamp, pass, turns, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [modelKey, 'humaneval', taskId, '2026-01-01T00:00:00.000Z', 1, 2, 500],
  });
}

describe('db-load: model rows', () => {
  it('returns an empty map for an empty DB', async () => {
    expect(await loadFromDb(client)).toEqual({});
  });

  it('decodes scalar columns, treating NULL as absent and 0/1 as booleans', async () => {
    await insertModel('groq:llama-4', {
      display_name: 'Llama 4',
      context_window: 128000,
      native_tools: 0,
      is_favorite: 1,
      removed: 0,
    });
    await insertModel('groq:bare');

    const store = await loadFromDb(client);
    expect(store['groq:llama-4']).toMatchObject({
      provider: 'groq',
      modelId: 'llama-4',
      displayName: 'Llama 4',
      contextWindow: 128000,
      nativeTools: false,
      isFavorite: true,
      removed: false,
    });
    expect(store['groq:bare'].displayName).toBeUndefined();
    expect(store['groq:bare'].contextWindow).toBeUndefined();
    expect(store['groq:bare'].nativeTools).toBeUndefined();
  });

  it('parses JSON blob columns', async () => {
    await insertModel('groq:llama-4', {
      settings: JSON.stringify({ temperature: 0.5 }),
      rate_limits: JSON.stringify({ buckets: { rpm: { limit: 30, intervalMs: 60000 } }, observedAt: 'now' }),
    });
    const entry = (await loadFromDb(client))['groq:llama-4'];
    expect(entry.settings).toEqual({ temperature: 0.5 });
    expect(entry.rateLimits?.buckets['rpm']?.limit).toBe(30);
  });

  it('skips a corrupt JSON blob instead of failing the whole load', async () => {
    await insertModel('groq:llama-4', { settings: '{not json' });
    await insertModel('groq:other', { display_name: 'Other' });

    const store = await loadFromDb(client);
    expect(store['groq:llama-4'].settings).toBeUndefined();
    expect(store['groq:other'].displayName).toBe('Other');
  });
});

describe('db-load: eval runs', () => {
  it('attaches runs to their model row, grouped by eval type', async () => {
    await insertModel('groq:llama-4');
    await insertEvalRun('groq:llama-4', 'task/0');
    await insertEvalRun('groq:llama-4', 'task/1');

    const runs = (await loadFromDb(client))['groq:llama-4'].evals?.['humaneval'];
    expect(runs).toHaveLength(2);
    expect(runs?.[0]).toMatchObject({ taskId: 'task/0', pass: true, turns: 2, durationMs: 500 });
  });

  it('leaves models with no runs without an evals key', async () => {
    await insertModel('groq:llama-4');
    expect((await loadFromDb(client))['groq:llama-4'].evals).toBeUndefined();
  });
});

describe('db-load: config', () => {
  it('returns nulls when no config rows exist', async () => {
    expect(await loadConfigFromDb(client)).toEqual({ global: null, providerOverrides: null });
  });

  it('parses each scope into its own field', async () => {
    await client.execute({
      sql: 'INSERT INTO config (scope, data) VALUES (?, ?), (?, ?)',
      args: ['global', JSON.stringify({ toolRationale: false }), 'providerOverrides', JSON.stringify({ groq: {} })],
    });
    const config = await loadConfigFromDb(client);
    expect(config.global).toEqual({ toolRationale: false });
    expect(config.providerOverrides).toEqual({ groq: {} });
  });

  it('skips a corrupt row and keeps the good one', async () => {
    await client.execute({
      sql: 'INSERT INTO config (scope, data) VALUES (?, ?), (?, ?)',
      args: ['global', '{not json', 'providerOverrides', JSON.stringify({ groq: {} })],
    });
    const config = await loadConfigFromDb(client);
    expect(config.global).toBeNull();
    expect(config.providerOverrides).toEqual({ groq: {} });
  });
});
