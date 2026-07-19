import type { Client } from '@libsql/client';

/**
 * Create every table and index idempotently. Run on each client open (including
 * after a replica wipe), so it must stay safe to re-execute against a live DB.
 * Table-by-table detail lives in docs/map/providers/db.md.
 */
export async function createSchema(c: Client): Promise<void> {
  await c.execute('PRAGMA foreign_keys = ON');
  await c.execute(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS config (
      scope TEXT PRIMARY KEY,
      data  TEXT NOT NULL
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS models (
      key          TEXT PRIMARY KEY,
      provider     TEXT NOT NULL,
      model_id     TEXT NOT NULL,
      native_tools INTEGER,
      is_favorite  INTEGER DEFAULT 0,
      settings     TEXT,
      rate_limits  TEXT,
      removed      INTEGER DEFAULT 0
    )
  `);
  // `models` predates the `removed` column; ADD COLUMN would throw "duplicate column"
  // on a DB that already has it, so guard with table_info before adding.
  const modelsInfo = await c.execute('PRAGMA table_info(models)');
  const hasRemoved = modelsInfo.rows.some((row) => row['name'] === 'removed');
  if (!hasRemoved) {
    await c.execute('ALTER TABLE models ADD COLUMN removed INTEGER DEFAULT 0');
  }
  await c.execute(`
    CREATE TABLE IF NOT EXISTS eval_runs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      model_key      TEXT NOT NULL REFERENCES models(key),
      eval_type      TEXT NOT NULL,
      task_id        TEXT NOT NULL,
      timestamp      TEXT NOT NULL,
      pass           INTEGER NOT NULL,
      warnings       INTEGER,
      turns          INTEGER,
      input_tokens   INTEGER,
      output_tokens  INTEGER,
      total_tokens   INTEGER,
      duration_ms    INTEGER,
      scenario_hash  TEXT,
      error          TEXT,
      checks         TEXT
    )
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS llm_calls (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      model_key     TEXT NOT NULL,
      timestamp     TEXT NOT NULL,
      status        INTEGER,
      input_tokens  INTEGER,
      output_tokens INTEGER,
      total_tokens  INTEGER,
      error         TEXT
    )
  `);
  await c.execute(`
    CREATE INDEX IF NOT EXISTS idx_llm_calls_model_time
      ON llm_calls (model_key, timestamp)
  `);
  await c.execute(`
    CREATE TABLE IF NOT EXISTS eval_transcripts (
      run_id      INTEGER PRIMARY KEY REFERENCES eval_runs(id),
      fail_reason TEXT,
      transcript  TEXT,
      scoring     TEXT
    )
  `);
}
