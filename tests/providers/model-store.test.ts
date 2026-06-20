import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// model-store resolves its store dir from $FREECODE_STORE. Both are pointed at temp dirs
// and the module is dynamically imported after the env vars are set, so tests never touch
// the committed `.freecode/`. DB is initialized via initStore() against a temp file each
// test, then torn down via resetStore() so the next test gets a fresh cache+client.
let store: typeof import('../../src/providers/model-store.js');
let db: typeof import('../../src/providers/db.js');
let tempStore = '';
const previousStore = process.env.FREECODE_STORE;

beforeEach(async () => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-store-'));
  process.env.FREECODE_STORE = tempStore;
  store = await import('../../src/providers/model-store.js');
  db = await import('../../src/providers/db.js');
  await db.initStore();
});

afterEach(async () => {
  await db.resetStore();
  if (previousStore === undefined) delete process.env.FREECODE_STORE;
  else process.env.FREECODE_STORE = previousStore;
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS will clean up */ }
});

describe('model-store: upsert/get', () => {
  it('returns undefined for an unknown key', () => {
    expect(store.getModel('groq:nope')).toBeUndefined();
  });

  it('upserts and reads back an entry, merging on re-upsert', () => {
    store.upsertModel({ provider: 'groq', modelId: 'llama-3.1-8b', displayName: 'LLaMA' });
    expect(store.getModel('groq:llama-3.1-8b')?.displayName).toBe('LLaMA');

    store.upsertModel({ provider: 'groq', modelId: 'llama-3.1-8b', contextWindow: 131072 });
    const entry = store.getModel('groq:llama-3.1-8b');
    expect(entry?.displayName).toBe('LLaMA');
    expect(entry?.contextWindow).toBe(131072);
  });
});

describe('model-store: favorites round-trip', () => {
  it('has no favorites by default', () => {
    expect(store.getFavorites().size).toBe(0);
  });

  it('sets and clears a favorite', () => {
    store.setFavorite('groq:llama-3.1-8b', true);
    expect(store.getFavorites().has('groq:llama-3.1-8b')).toBe(true);
    expect(store.getModel('groq:llama-3.1-8b')).toMatchObject({ isFavorite: true });

    store.setFavorite('groq:llama-3.1-8b', false);
    expect(store.getFavorites().has('groq:llama-3.1-8b')).toBe(false);
  });
});

describe('model-store: nativeTools round-trip', () => {
  it('reports native tools as enabled by default', () => {
    expect(store.isNativeToolsDisabled('openai', 'gpt-4o')).toBe(false);
    expect(store.getNoNativeToolsKeys().size).toBe(0);
  });

  it('disables and re-enables native tools', () => {
    store.setNativeTools('groq', 'llama-3.1-8b', false);
    expect(store.isNativeToolsDisabled('groq', 'llama-3.1-8b')).toBe(true);
    expect(store.getNoNativeToolsKeys().has('groq:llama-3.1-8b')).toBe(true);
    expect(store.getModel('groq:llama-3.1-8b')).toMatchObject({ nativeTools: false });

    store.setNativeTools('groq', 'llama-3.1-8b', true);
    expect(store.isNativeToolsDisabled('groq', 'llama-3.1-8b')).toBe(false);
    expect(store.getNoNativeToolsKeys().size).toBe(0);
  });
});

describe('model-store: settings round-trip', () => {
  it('returns empty object for unknown key', () => {
    expect(store.getModelSettings('groq:nope')).toEqual({});
  });

  it('sets and reads back a single field', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', false);
    expect(store.getModelSettings('groq:llama-3.1-8b')).toMatchObject({ toolRationale: false });
    expect(store.getModel('groq:llama-3.1-8b')).toMatchObject({
      settings: { toolRationale: false },
    });
  });

  it('clears a field by passing undefined', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', false);
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', undefined);
    expect(store.getModelSettings('groq:llama-3.1-8b')).toEqual({});
  });

  it('keeps settings as {} after all fields cleared', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', false);
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', undefined);
    expect(store.getModelSettings('groq:llama-3.1-8b')).toEqual({});
  });

  it('merges multiple fields without clobbering', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', false);
    store.setModelSetting('groq:llama-3.1-8b', 'parallelTools', true);
    const s = store.getModelSettings('groq:llama-3.1-8b');
    expect(s.toolRationale).toBe(false);
    expect(s.parallelTools).toBe(true);
  });
});

describe('model-store: appendEvalRun', () => {
  const fakeSummary = {
    timestamp: '2026-06-11T12:00:00.000Z',
    taskId: 'HumanEval/0',
    pass: true,
    turns: 3,
    tokenUsage: { input: 100, output: 50 },
    durationMs: 1234,
    error: null as null,
  };
  const fakeDoc = {
    pass: true,
    freecodeVersion: null as null,
    transcript: [{ role: 'user', content: 'hi' }],
    scoringOutcome: { pass: true },
  };

  it('appends the summary and makes it readable via getModel', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval', fakeSummary, fakeDoc);
    const entry = store.getModel('groq:llama-3.1-8b');
    expect(entry?.evals?.['humaneval']).toHaveLength(1);
    expect(entry?.evals?.['humaneval']?.[0]).toMatchObject({
      taskId: 'HumanEval/0',
      pass: true,
      turns: 3,
      error: null,
    });
  });

  it('creates the entry if it does not exist yet', () => {
    store.appendEvalRun('groq:new-model', 'humaneval', { ...fakeSummary, taskId: 'HumanEval/1' }, fakeDoc);
    const entry = store.getModel('groq:new-model');
    expect(entry?.provider).toBe('groq');
    expect(entry?.modelId).toBe('new-model');
    expect(entry?.evals?.['humaneval']).toHaveLength(1);
  });

  it('persists the eval for a never-upserted model across reinit', async () => {
    // Regression: appendEvalRun must persist the models row, not just the cache.
    // Otherwise loadFromDb skips eval_runs whose model_key has no models row.
    store.appendEvalRun('groq:eval-only-model', 'humaneval', { ...fakeSummary, taskId: 'HumanEval/2' }, fakeDoc);

    await db.resetStore(); // drains fire-and-forget writes, then closes the client
    await db.initStore();

    const entry = store.getModel('groq:eval-only-model');
    expect(entry?.evals?.['humaneval']).toHaveLength(1);
    expect(entry?.evals?.['humaneval']?.[0].taskId).toBe('HumanEval/2');
  });

  it('appends multiple runs without clobbering', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval', fakeSummary, fakeDoc);
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { ...fakeSummary, timestamp: '2026-06-11T13:00:00.000Z', taskId: 'HumanEval/1', pass: false, error: null },
      { ...fakeDoc, pass: false });
    const runs = store.getModel('groq:llama-3.1-8b')?.evals?.['humaneval'];
    expect(runs).toHaveLength(2);
    expect(runs?.[0].taskId).toBe('HumanEval/0');
    expect(runs?.[1].taskId).toBe('HumanEval/1');
  });
});

describe('model-store: appendEvalRun with custom evalType', () => {
  const customSummary = {
    timestamp: '2026-06-11T12:00:00.000Z',
    taskId: '001-hello-world',
    pass: false,
    turns: 2,
    tokenUsage: { input: 80, output: 30 },
    durationMs: 500,
    error: null as null,
  };
  const customDoc = {
    pass: false,
    failReason: 'write-file: expected hello.txt to exist',
    freecodeVersion: null as null,
    transcript: [{ systemPrompt: 'sys', userMessage: 'user', toolCalls: [] }],
    scoringOutcome: [{ name: 'write-file', kind: 'assertion', pass: false }],
  };

  it('writes the summary under evals/custom/', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'custom', customSummary, customDoc);
    const entry = store.getModel('groq:llama-3.1-8b');
    expect(entry?.evals?.['custom']).toHaveLength(1);
    expect(entry?.evals?.['custom']?.[0].taskId).toBe('001-hello-world');
  });
});

describe('model-store: getHumanEvalResults', () => {
  it('returns empty object when no evals exist', () => {
    expect(store.getHumanEvalResults('groq:llama-3.1-8b')).toEqual({});
  });

  it('returns pass/fail for non-error runs', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { timestamp: '2026-06-11T12:00:00.000Z', taskId: 'HumanEval/0', pass: true, turns: 1,
        tokenUsage: {}, durationMs: 100, error: null },
      { pass: true, freecodeVersion: null, transcript: [], scoringOutcome: {} });
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { timestamp: '2026-06-11T12:01:00.000Z', taskId: 'HumanEval/1', pass: false, turns: 2,
        tokenUsage: {}, durationMs: 200, error: null },
      { pass: false, failReason: 'assertion failed', freecodeVersion: null, transcript: [], scoringOutcome: {} });
    const results = store.getHumanEvalResults('groq:llama-3.1-8b');
    expect(results['HumanEval/0']).toBe('pass');
    expect(results['HumanEval/1']).toBe('fail');
  });

  it('excludes runs where error is set (crashes do not wipe prior dots)', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { timestamp: '2026-06-11T12:00:00.000Z', taskId: 'HumanEval/0', pass: true, turns: 1,
        tokenUsage: {}, durationMs: 100, error: null },
      { pass: true, freecodeVersion: null, transcript: [], scoringOutcome: {} });
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { timestamp: '2026-06-11T13:00:00.000Z', taskId: 'HumanEval/0', pass: false, turns: 0,
        tokenUsage: {}, durationMs: 50, error: 'agent did not finish' },
      { pass: false, freecodeVersion: null, transcript: [], scoringOutcome: {} });
    const results = store.getHumanEvalResults('groq:llama-3.1-8b');
    expect(results['HumanEval/0']).toBe('pass');
  });

  it('takes the latest non-error run per taskId', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { timestamp: '2026-06-11T12:00:00.000Z', taskId: 'HumanEval/0', pass: false, turns: 1,
        tokenUsage: {}, durationMs: 100, error: null },
      { pass: false, freecodeVersion: null, transcript: [], scoringOutcome: {} });
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { timestamp: '2026-06-11T13:00:00.000Z', taskId: 'HumanEval/0', pass: true, turns: 2,
        tokenUsage: {}, durationMs: 200, error: null },
      { pass: true, freecodeVersion: null, transcript: [], scoringOutcome: {} });
    expect(store.getHumanEvalResults('groq:llama-3.1-8b')['HumanEval/0']).toBe('pass');
  });
});
