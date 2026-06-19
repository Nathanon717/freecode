import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// model-store resolves its store dir from $FREECODE_STORE; the legacy seed reads
// config.json from $FREECODE_HOME. Both are pointed at temp dirs and the module is
// dynamically imported after the env vars are set, so tests never touch the
// committed `.freecode/`. Mirrors tests/providers/model-traits.test.ts.
// getStoreDir()/getConfigPaths() read their env vars lazily on each call, so a
// single import is enough; each test just repoints the temp dirs in beforeEach.
// db.ts is initialized via initStore() against a temp file: DB each test, then torn
// down via resetStore() so the next test gets a fresh cache+client.
let store: typeof import('../../src/providers/model-store.js');
let db: typeof import('../../src/providers/db.js');
let tempStore = '';
let tempHome = '';
const previousStore = process.env.FREECODE_STORE;
const previousHome = process.env.FREECODE_HOME;

function writeLegacyFavorites(keys: string[]): void {
  writeFileSync(join(tempHome, 'config.json'), JSON.stringify({ favoriteModels: keys }), 'utf-8');
}

function writeLegacyTraits(noNativeTools: string[]): void {
  writeFileSync(join(tempHome, 'model-traits.json'), JSON.stringify({ noNativeTools }), 'utf-8');
}

function writeLegacyModelOverrides(overrides: Record<string, Record<string, unknown>>): void {
  writeFileSync(join(tempHome, 'config.json'), JSON.stringify({ modelOverrides: overrides }), 'utf-8');
}

function readConfigFile(): Record<string, unknown> {
  const path = join(tempHome, 'config.json');
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

function readStoreFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(tempStore, 'models.json'), 'utf-8'));
}

beforeEach(async () => {
  tempStore = mkdtempSync(join(tmpdir(), 'freecode-store-'));
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-home-'));
  process.env.FREECODE_STORE = tempStore;
  process.env.FREECODE_HOME = tempHome;
  store = await import('../../src/providers/model-store.js');
  db = await import('../../src/providers/db.js');
  await db.initStore();
});

afterEach(async () => {
  await db.resetStore();
  if (previousStore === undefined) delete process.env.FREECODE_STORE;
  else process.env.FREECODE_STORE = previousStore;
  if (previousHome === undefined) delete process.env.FREECODE_HOME;
  else process.env.FREECODE_HOME = previousHome;
  // Best-effort cleanup — Windows may hold SQLite WAL file handles briefly after close().
  try { rmSync(tempStore, { recursive: true, force: true }); } catch { /* OS will clean up */ }
  try { rmSync(tempHome, { recursive: true, force: true }); } catch { /* OS will clean up */ }
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

  it('sets and clears a favorite, persisting to disk', () => {
    store.setFavorite('groq:llama-3.1-8b', true);
    expect(store.getFavorites().has('groq:llama-3.1-8b')).toBe(true);
    expect(readStoreFile()['groq:llama-3.1-8b']).toMatchObject({ isFavorite: true });

    store.setFavorite('groq:llama-3.1-8b', false);
    expect(store.getFavorites().has('groq:llama-3.1-8b')).toBe(false);
  });
});

describe('model-store: seed favorites from legacy config', () => {
  it('seeds config.favoriteModels as isFavorite on first read', async () => {
    writeLegacyFavorites(['groq:llama-3.1-8b', 'openai:gpt-4o']);
    const favs = store.getFavorites();
    expect(favs.has('groq:llama-3.1-8b')).toBe(true);
    expect(favs.has('openai:gpt-4o')).toBe(true);
    expect(readStoreFile()['openai:gpt-4o']).toMatchObject({
      provider: 'openai',
      modelId: 'gpt-4o',
      isFavorite: true,
    });
  });

  it('does not re-seed once the store file exists (unfavorite-all stays empty)', () => {
    writeLegacyFavorites(['groq:llama-3.1-8b']);
    store.getFavorites(); // first read seeds + creates the store file
    store.setFavorite('groq:llama-3.1-8b', false); // unfavorite everything
    // legacy config still lists the model, but store file now exists -> no re-seed
    expect(store.getFavorites().size).toBe(0);
  });

  it('leaves an already-populated store untouched (no seed)', () => {
    store.setFavorite('groq:other', true); // creates store file first
    writeLegacyFavorites(['groq:llama-3.1-8b']);
    const favs = store.getFavorites();
    expect(favs.has('groq:other')).toBe(true);
    expect(favs.has('groq:llama-3.1-8b')).toBe(false);
  });
});

describe('model-store: nativeTools round-trip', () => {
  it('reports native tools as enabled by default', () => {
    expect(store.isNativeToolsDisabled('openai', 'gpt-4o')).toBe(false);
    expect(store.getNoNativeToolsKeys().size).toBe(0);
  });

  it('disables and re-enables native tools, persisting to disk', () => {
    store.setNativeTools('groq', 'llama-3.1-8b', false);
    expect(store.isNativeToolsDisabled('groq', 'llama-3.1-8b')).toBe(true);
    expect(store.getNoNativeToolsKeys().has('groq:llama-3.1-8b')).toBe(true);
    expect(readStoreFile()['groq:llama-3.1-8b']).toMatchObject({ nativeTools: false });

    store.setNativeTools('groq', 'llama-3.1-8b', true);
    expect(store.isNativeToolsDisabled('groq', 'llama-3.1-8b')).toBe(false);
    expect(store.getNoNativeToolsKeys().size).toBe(0);
  });
});

describe('model-store: seed nativeTools from legacy model-traits', () => {
  it('seeds nativeTools:false for legacy no-native-tools models on first read', () => {
    writeLegacyTraits(['groq:llama-3.1-8b', 'mistral:ministral-8b']);
    expect(store.isNativeToolsDisabled('groq', 'llama-3.1-8b')).toBe(true);
    expect(store.getNoNativeToolsKeys().has('mistral:ministral-8b')).toBe(true);
    expect(readStoreFile()['groq:llama-3.1-8b']).toMatchObject({
      provider: 'groq',
      modelId: 'llama-3.1-8b',
      nativeTools: false,
    });
  });

  it('does not overwrite a key that already has a nativeTools value', () => {
    store.setNativeTools('groq', 'llama-3.1-8b', true);
    writeLegacyTraits(['groq:llama-3.1-8b']);
    expect(store.isNativeToolsDisabled('groq', 'llama-3.1-8b')).toBe(false);
  });
});

describe('model-store: settings round-trip', () => {
  it('returns empty object for unknown key', () => {
    expect(store.getModelSettings('groq:nope')).toEqual({});
  });

  it('sets and reads back a single field', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', false);
    expect(store.getModelSettings('groq:llama-3.1-8b')).toMatchObject({ toolRationale: false });
    expect(readStoreFile()['groq:llama-3.1-8b']).toMatchObject({
      settings: { toolRationale: false },
    });
  });

  it('clears a field by passing undefined', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', false);
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', undefined);
    expect(store.getModelSettings('groq:llama-3.1-8b')).toEqual({});
  });

  it('keeps settings as {} (not undefined) after all fields cleared — re-seed guard stays inactive', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', false);
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', undefined);
    // Write legacy modelOverrides AFTER clearing; should not re-seed
    writeLegacyModelOverrides({ 'groq:llama-3.1-8b': { toolRationale: true } });
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

describe('model-store: seed settings from legacy config.modelOverrides', () => {
  it('seeds modelOverrides into store.settings on first read', () => {
    writeLegacyModelOverrides({
      'groq:llama-3.1-8b': { toolRationale: false },
      'openai:gpt-4o': { parallelTools: false },
    });
    expect(store.getModelSettings('groq:llama-3.1-8b')).toMatchObject({ toolRationale: false });
    expect(store.getModelSettings('openai:gpt-4o')).toMatchObject({ parallelTools: false });
    expect(readStoreFile()['groq:llama-3.1-8b']).toMatchObject({
      provider: 'groq',
      modelId: 'llama-3.1-8b',
      settings: { toolRationale: false },
    });
  });

  it('removes modelOverrides from config.json after seeding', () => {
    writeLegacyModelOverrides({ 'groq:llama-3.1-8b': { toolRationale: false } });
    store.getModelSettings('groq:llama-3.1-8b');
    expect(readConfigFile()).not.toHaveProperty('modelOverrides');
  });

  it('does not overwrite an already-seeded key', () => {
    store.setModelSetting('groq:llama-3.1-8b', 'toolRationale', true);
    writeLegacyModelOverrides({ 'groq:llama-3.1-8b': { toolRationale: false } });
    expect(store.getModelSettings('groq:llama-3.1-8b')).toMatchObject({ toolRationale: true });
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

  it('appends the summary to models.json', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval', fakeSummary, fakeDoc);
    const entry = readStoreFile()['groq:llama-3.1-8b'];
    expect(entry.evals.humaneval).toHaveLength(1);
    expect(entry.evals.humaneval[0]).toMatchObject({
      taskId: 'HumanEval/0',
      pass: true,
      turns: 3,
      error: null,
    });
    expect(entry.evals.humaneval[0].transcriptRef).toMatch(/^evals\/humaneval\/groq-llama-3\.1-8b\//);
  });

  it('writes the transcript file at the transcriptRef path', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval', fakeSummary, fakeDoc);
    const entry = readStoreFile()['groq:llama-3.1-8b'];
    const ref = entry.evals.humaneval[0].transcriptRef as string;
    const absPath = join(tempStore, ref);
    expect(existsSync(absPath)).toBe(true);
    const written = JSON.parse(readFileSync(absPath, 'utf-8'));
    expect(written).toMatchObject({
      provider: 'groq',
      modelId: 'llama-3.1-8b',
      evalType: 'humaneval',
      pass: true,
      transcript: [{ role: 'user', content: 'hi' }],
    });
  });

  it('creates the entry if it does not exist yet', () => {
    store.appendEvalRun('groq:new-model', 'humaneval', { ...fakeSummary, taskId: 'HumanEval/1' }, fakeDoc);
    const entry = readStoreFile()['groq:new-model'];
    expect(entry.provider).toBe('groq');
    expect(entry.modelId).toBe('new-model');
    expect(entry.evals.humaneval).toHaveLength(1);
  });

  it('appends multiple runs without clobbering', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval', fakeSummary, fakeDoc);
    store.appendEvalRun('groq:llama-3.1-8b', 'humaneval',
      { ...fakeSummary, timestamp: '2026-06-11T13:00:00.000Z', taskId: 'HumanEval/1', pass: false, error: null },
      { ...fakeDoc, pass: false });
    const runs = readStoreFile()['groq:llama-3.1-8b'].evals.humaneval;
    expect(runs).toHaveLength(2);
    expect(runs[0].taskId).toBe('HumanEval/0');
    expect(runs[1].taskId).toBe('HumanEval/1');
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

  it('writes the transcript under evals/custom/', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'custom', customSummary, customDoc);
    const entry = readStoreFile()['groq:llama-3.1-8b'];
    expect(entry.evals.custom).toHaveLength(1);
    expect(entry.evals.custom[0].taskId).toBe('001-hello-world');
    expect(entry.evals.custom[0].transcriptRef).toMatch(/^evals\/custom\/groq-llama-3\.1-8b\//);
  });

  it('transcript file contains failReason when pass is false', () => {
    store.appendEvalRun('groq:llama-3.1-8b', 'custom', customSummary, customDoc);
    const entry = readStoreFile()['groq:llama-3.1-8b'];
    const ref = entry.evals.custom[0].transcriptRef as string;
    const written = JSON.parse(readFileSync(join(tempStore, ref), 'utf-8'));
    expect(written.failReason).toBe('write-file: expected hello.txt to exist');
    expect(written.evalType).toBe('custom');
    expect(written.scoringOutcome).toHaveLength(1);
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
    // Crash run recorded later — should not overwrite the prior pass
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
