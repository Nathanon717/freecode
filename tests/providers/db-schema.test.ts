import { createClient, type Client } from '@libsql/client';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSchema } from '../../src/providers/db-schema.js';

// Runs the real DDL against a real temp SQLite file — no mocks, so the
// assertions are on actual sqlite_master state and actual constraint behaviour.
let tempDir = '';
let client: Client;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'freecode-schema-'));
  client = createClient({ url: `file:${join(tempDir, 'test.db')}` });
});

afterEach(() => {
  try { client.close(); } catch { /* already closed */ }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

async function tableNames(): Promise<string[]> {
  const res = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  return res.rows.map((r) => r['name'] as string).filter((n) => !n.startsWith('sqlite_'));
}

describe('db-schema: createSchema', () => {
  it('creates every table', async () => {
    await createSchema(client);
    expect(await tableNames()).toEqual([
      'config', 'eval_runs', 'eval_transcripts', 'llm_calls', 'meta', 'models',
    ]);
  });

  it('creates the llm_calls lookup index', async () => {
    await createSchema(client);
    const res = await client.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_llm_calls_model_time'");
    expect(res.rows).toHaveLength(1);
  });

  it('is idempotent against a populated database', async () => {
    // createSchema runs on every client open, including after a replica wipe
    // reopens against an existing file — a second run must not throw or wipe data.
    await createSchema(client);
    await client.execute({
      sql: 'INSERT INTO llm_calls (model_key, timestamp, status) VALUES (?, ?, ?)',
      args: ['groq:llama-3.3-70b-versatile', '2026-07-18T00:00:00.000Z', 200],
    });

    await createSchema(client);

    const res = await client.execute('SELECT COUNT(*) AS n FROM llm_calls');
    expect(Number(res.rows[0]['n'])).toBe(1);
  });

  it('accepts an llm_calls row for a model absent from models', async () => {
    // Foreign keys are ON, so this asserts the omitted FK is real: the call log
    // must never fail on a missing parent row.
    await createSchema(client);
    await expect(client.execute({
      sql: 'INSERT INTO llm_calls (model_key, timestamp) VALUES (?, ?)',
      args: ['mystery:never-persisted', '2026-07-18T00:00:00.000Z'],
    })).resolves.toBeDefined();
  });

  it('enforces the eval_runs foreign key, proving PRAGMA foreign_keys is on', async () => {
    await createSchema(client);
    await expect(client.execute({
      sql: 'INSERT INTO eval_runs (model_key, eval_type, task_id, timestamp, pass) VALUES (?, ?, ?, ?, ?)',
      args: ['absent:model', 'unit', 't1', '2026-07-18T00:00:00.000Z', 1],
    })).rejects.toThrow(/FOREIGN KEY/i);
  });
});
