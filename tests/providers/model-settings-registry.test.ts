import { describe, it, expect, beforeEach } from 'vitest';
import { registerModelSettings, getModelSettings } from '../../src/providers/model-settings-registry.js';

beforeEach(() => {
  // Reset registry between tests
  registerModelSettings(() => ({}));
});

describe('model-settings-registry: default behavior', () => {
  it('returns {} when nothing is registered', () => {
    registerModelSettings(() => ({}));
    expect(getModelSettings('anthropic:claude-3-5-sonnet')).toEqual({});
  });
});

describe('model-settings-registry: registration', () => {
  it('returns the value from the registered function', () => {
    const settings = { toolRationale: false };
    registerModelSettings((key) => key === 'openai:gpt-4o' ? settings : {});
    expect(getModelSettings('openai:gpt-4o')).toEqual(settings);
  });

  it('returns {} for an unknown key', () => {
    registerModelSettings((key) => key === 'openai:gpt-4o' ? { parallelTools: true } : {});
    expect(getModelSettings('anthropic:claude-3-5-haiku')).toEqual({});
  });

  it('last registration wins', () => {
    registerModelSettings(() => ({ toolRationale: true }));
    registerModelSettings(() => ({ toolRationale: false }));
    expect(getModelSettings('any:model')).toEqual({ toolRationale: false });
  });
});
