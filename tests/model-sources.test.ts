import { describe, expect, it } from 'vitest';
import { MODEL_DATA_SOURCES, getAllModelDataSources, getModelDataSourcesByKind } from '../src/providers/model-sources.js';

describe('model data sources', () => {
  it('includes primary normalized registries', () => {
    const ids = MODEL_DATA_SOURCES.map(source => source.id);

    expect(ids).toContain('litellm');
    expect(ids).toContain('portkey-models');
    expect(ids).toContain('openrouter-models');
  });

  it('includes official provider sources', () => {
    const official = getModelDataSourcesByKind('official').map(source => source.id);

    expect(official).toContain('openai');
    expect(official).toContain('anthropic');
    expect(official).toContain('gemini');
    expect(official).toContain('aws-bedrock');
  });

  it('returns copies so callers cannot mutate the catalog arrays', () => {
    const sources = getAllModelDataSources();
    sources[0].provides.push('mutated');

    expect(MODEL_DATA_SOURCES[0].provides).not.toContain('mutated');
  });
});
