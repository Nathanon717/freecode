import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// model-traits computes its file path from FREECODE_HOME at module load, so we
// point FREECODE_HOME at a temp dir and load the module with a dynamic import
// after the env var is set.
let traits: typeof import('../../src/providers/model-traits.js');
let tempHome = '';
const previousHome = process.env.FREECODE_HOME;

beforeAll(async () => {
  tempHome = mkdtempSync(join(tmpdir(), 'freecode-traits-'));
  process.env.FREECODE_HOME = tempHome;
  traits = await import('../../src/providers/model-traits.js');
});

afterAll(() => {
  if (previousHome === undefined) delete process.env.FREECODE_HOME;
  else process.env.FREECODE_HOME = previousHome;
  rmSync(tempHome, { recursive: true, force: true });
});

describe('model-traits store', () => {
  it('reports models as supporting native tools by default', () => {
    expect(traits.isModelNoNativeTools('openai', 'gpt-4o')).toBe(false);
    expect(traits.getNoNativeToolsModels().size).toBe(0);
  });

  it('persists a no-native-tools mark and reads it back', () => {
    traits.markModelNoNativeTools('groq', 'llama-3.1-8b');
    expect(traits.isModelNoNativeTools('groq', 'llama-3.1-8b')).toBe(true);
    expect(traits.getNoNativeToolsModels().has('groq:llama-3.1-8b')).toBe(true);
  });

  it('does not duplicate an already-marked model', () => {
    traits.markModelNoNativeTools('groq', 'llama-3.1-8b');
    traits.markModelNoNativeTools('groq', 'llama-3.1-8b');
    const all = [...traits.getNoNativeToolsModels()].filter(m => m === 'groq:llama-3.1-8b');
    expect(all).toHaveLength(1);
  });

  it('keeps distinct models separate', () => {
    traits.markModelNoNativeTools('mistral', 'ministral-8b');
    expect(traits.isModelNoNativeTools('mistral', 'ministral-8b')).toBe(true);
    expect(traits.isModelNoNativeTools('groq', 'llama-3.1-8b')).toBe(true);
  });
});
