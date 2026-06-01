import { describe, expect, it } from 'vitest';
import { filterModelItems, type ModelMenuItem } from '../src/commands/model.js';

const items: ModelMenuItem[] = [
  {
    providerId: 'openai',
    providerName: 'OpenAI',
    modelId: 'gpt-5.1-codex',
    displayName: 'GPT-5.1 Codex',
  },
  {
    providerId: 'anthropic',
    providerName: 'Anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
  },
];

describe('model picker filtering', () => {
  it('filters by display name, model id, provider, and full preference', () => {
    expect(filterModelItems(items, 'codex').map(item => item.modelId)).toEqual(['gpt-5.1-codex']);
    expect(filterModelItems(items, 'ANTHROPIC').map(item => item.modelId)).toEqual(['claude-sonnet-4-6']);
    expect(filterModelItems(items, 'openai:gpt').map(item => item.modelId)).toEqual(['gpt-5.1-codex']);
  });

  it('returns all models for blank filters and no models for misses', () => {
    expect(filterModelItems(items, '   ')).toHaveLength(2);
    expect(filterModelItems(items, 'missing')).toEqual([]);
  });
});
