import { describe, expect, it } from 'vitest';
import {
  getCanonicalGroupKey,
  addToCanonicalGroup,
  type CanonicalModelGroups,
} from '../src/providers/canonical-models.js';

const GROUPS: CanonicalModelGroups = {
  'GPT-4o': ['openai:gpt-4o', 'azure:gpt-4o'],
  'Claude Sonnet': ['anthropic:claude-3-5-sonnet'],
  other: ['groq:llama-3.1-8b'],
};

describe('getCanonicalGroupKey', () => {
  it('finds the group containing a provider:model entry', () => {
    expect(getCanonicalGroupKey('openai', 'gpt-4o', GROUPS)).toBe('GPT-4o');
    expect(getCanonicalGroupKey('azure', 'gpt-4o', GROUPS)).toBe('GPT-4o');
    expect(getCanonicalGroupKey('anthropic', 'claude-3-5-sonnet', GROUPS)).toBe('Claude Sonnet');
  });

  it('returns undefined when the model is not in any group', () => {
    expect(getCanonicalGroupKey('openai', 'gpt-5', GROUPS)).toBeUndefined();
  });
});

describe('addToCanonicalGroup', () => {
  it('adds a new entry to an existing group without mutating the input', () => {
    const updated = addToCanonicalGroup('GPT-4o', 'openrouter', 'gpt-4o', GROUPS);
    expect(updated['GPT-4o']).toContain('openrouter:gpt-4o');
    // original unchanged
    expect(GROUPS['GPT-4o']).not.toContain('openrouter:gpt-4o');
  });

  it('creates the group when it does not exist yet', () => {
    const updated = addToCanonicalGroup('New Group', 'mistral', 'ministral-8b', {});
    expect(updated['New Group']).toEqual(['mistral:ministral-8b']);
  });

  it('returns the same object when the entry already exists', () => {
    const updated = addToCanonicalGroup('GPT-4o', 'openai', 'gpt-4o', GROUPS);
    expect(updated).toBe(GROUPS);
  });
});
