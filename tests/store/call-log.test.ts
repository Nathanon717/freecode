import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Same temp-store harness as db.test.ts: $FREECODE_STORE/$FREECODE_HOME point at
// temp dirs so nothing touches committed state. Rows are asserted by opening a
// second, plain libSQL client on the same file — real SQL against real state,
// not "was the mock called".
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let callLog: typeof import('../../src/store/call-log.js');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let db: typeof import('../../src/store/db.js');
let tempStore = '';
let tempHome = '';
const previousStore = process.env.FREECODE_STORE;
const previousHome = process.env.FREECODE_HOME;

async function readCallRows() {
  await db.drainPendingWrites();
  const c = createClient({ url: `file:${join(tempStore, 'freecode.db')}` });
  try {
    const res = await c.execute('SELECT * FROM llm_calls ORDER BY id ASC');
    return res.rows;
  } finally {
    c.close();
  }
}

beforeEach(async () => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-calllog-'));
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-home-'));
  process.env.FREECODE_STORE = tempStore;
  process.env.FREECODE_HOME = tempHome;
  db = await import('../../src/store/db.js');
  callLog = await import('../../src/store/call-log.js');
  await db.initStore();
});

afterEach(async () => {
  await db.resetStore();
  if (previousStore === undefined) delete process.env.FREECODE_STORE;
  else process.env.FREECODE_STORE = previousStore;
  if (previousHome === undefined) delete process.env.FREECODE_HOME;
  else process.env.FREECODE_HOME = previousHome;
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS will clean up */ }
  try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

describe('call-log: tokensFromUsagePayload', () => {
  it('reads the OpenAI-compatible shape', () => {
    expect(callLog.tokensFromUsagePayload({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }))
      .toEqual({ inputTokens: 10, outputTokens: 4, totalTokens: 14 });
  });

  it('reads the Anthropic shape and derives the missing total', () => {
    expect(callLog.tokensFromUsagePayload({ input_tokens: 7, output_tokens: 3 }))
      .toEqual({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
  });

  it('prefers the provider-reported total over the sum', () => {
    // A provider whose total includes tokens not broken out (e.g. cache reads)
    // must be recorded as sent, not silently "corrected" to input+output.
    expect(callLog.tokensFromUsagePayload({ prompt_tokens: 10, completion_tokens: 4, total_tokens: 99 }).totalTokens)
      .toBe(99);
  });

  it('nulls every field for an unrecognised or absent payload', () => {
    const allNull = { inputTokens: null, outputTokens: null, totalTokens: null };
    expect(callLog.tokensFromUsagePayload(undefined)).toEqual(allNull);
    expect(callLog.tokensFromUsagePayload(null)).toEqual(allNull);
    expect(callLog.tokensFromUsagePayload('nonsense')).toEqual(allNull);
    expect(callLog.tokensFromUsagePayload({ unrelated: 5 })).toEqual(allNull);
  });

  it('does not derive a total from a half-reported payload', () => {
    // Guessing the missing half would fabricate a number the provider never sent.
    expect(callLog.tokensFromUsagePayload({ prompt_tokens: 10 }))
      .toEqual({ inputTokens: 10, outputTokens: null, totalTokens: null });
  });

  it('rejects non-finite and non-numeric token values', () => {
    expect(callLog.tokensFromUsagePayload({ prompt_tokens: NaN, completion_tokens: '4' }))
      .toEqual({ inputTokens: null, outputTokens: null, totalTokens: null });
  });
});

describe('call-log: recordLlmCall', () => {
  it('persists a successful call with provider-reported tokens', async () => {
    callLog.recordLlmCall({ modelKey: 'groq:llama-3.3-70b-versatile', status: 200, inputTokens: 12, outputTokens: 5, totalTokens: 17 });

    const rows = await readCallRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model_key: 'groq:llama-3.3-70b-versatile',
      status: 200,
      input_tokens: 12,
      output_tokens: 5,
      total_tokens: 17,
      error: null,
    });
    expect(rows[0]['timestamp'] as string).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('persists an error call with a null status when there was no response', async () => {
    callLog.recordLlmCall({ modelKey: 'zen:big-pickle', error: 'fetch failed: ECONNRESET' });

    const rows = await readCallRows();
    expect(rows[0]).toMatchObject({
      model_key: 'zen:big-pickle',
      status: null,
      input_tokens: null,
      error: 'fetch failed: ECONNRESET',
    });
  });

  it('leaves token columns null when the provider reported no usage', async () => {
    // A null token column means "the provider did not tell us" — that absence is
    // the signal the log exists to capture, so it must never become a zero.
    callLog.recordLlmCall({ modelKey: 'zen:deepseek-v4-flash-free', status: 200 });

    const rows = await readCallRows();
    expect(rows[0]).toMatchObject({ input_tokens: null, output_tokens: null, total_tokens: null });
  });

  it('logs a model that has no row in the models table', async () => {
    // llm_calls deliberately carries no FK to models; a call for an unpersisted
    // model must still be recorded rather than dropped on a missing parent.
    callLog.recordLlmCall({ modelKey: 'mystery:never-persisted', status: 200 });

    const rows = await readCallRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ model_key: 'mystery:never-persisted' });
  });

  it('appends one row per call rather than upserting', async () => {
    callLog.recordLlmCall({ modelKey: 'groq:openai/gpt-oss-20b', status: 200, inputTokens: 1 });
    callLog.recordLlmCall({ modelKey: 'groq:openai/gpt-oss-20b', status: 200, inputTokens: 2 });
    callLog.recordLlmCall({ modelKey: 'groq:openai/gpt-oss-20b', status: 429, error: 'rate limited' });

    const rows = await readCallRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r['input_tokens'])).toEqual([1, 2, null]);
  });
});
