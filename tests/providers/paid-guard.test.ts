import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FREE_ONLY_ENV_VAR,
  isFreeOnlyMode,
  isPaidApiKeyEnvVar,
  PAID_API_KEY_ENV_VARS,
} from '../../src/providers/paid-guard.js';
import { isFreeModel, PROVIDER_REGISTRY, selectFreeModels } from '../../src/providers/provider-catalog.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('free-only mode', () => {
  it('is off unless the flag is exactly 1', () => {
    expect(isFreeOnlyMode({})).toBe(false);
    expect(isFreeOnlyMode({ [FREE_ONLY_ENV_VAR]: '0' })).toBe(false);
    expect(isFreeOnlyMode({ [FREE_ONLY_ENV_VAR]: 'true' })).toBe(false);
    expect(isFreeOnlyMode({ [FREE_ONLY_ENV_VAR]: '1' })).toBe(true);
  });
});

describe('paid credential env vars', () => {
  // src/index.ts filters these out of the Doppler payload before anything can read
  // them, and it does so from literals because it runs before the catalog loads.
  // This is what keeps those literals honest.
  it('covers every provider flagged paid', () => {
    const paidKeyVars = PROVIDER_REGISTRY.filter(p => p.paid).map(p => p.apiKeyEnvVar);
    expect(paidKeyVars.length).toBeGreaterThan(0);
    for (const envVar of paidKeyVars) {
      expect(isPaidApiKeyEnvVar(envVar)).toBe(true);
    }
  });

  it('does not sweep up a free provider key', () => {
    const freeKeyVars = PROVIDER_REGISTRY.filter(p => !p.paid).map(p => p.apiKeyEnvVar);
    for (const envVar of freeKeyVars) {
      expect(isPaidApiKeyEnvVar(envVar)).toBe(false);
    }
  });

  it('includes the read-only billing key so no paid credential survives', () => {
    expect(PAID_API_KEY_ENV_VARS).toContain('OPENAI_ADMIN_KEY');
  });
});

describe('free model predicate', () => {
  const openrouter = PROVIDER_REGISTRY.find(p => p.id === 'openrouter')!;
  const zen = PROVIDER_REGISTRY.find(p => p.id === 'zen')!;
  const groq = PROVIDER_REGISTRY.find(p => p.id === 'groq')!;
  const openai = PROVIDER_REGISTRY.find(p => p.id === 'openai')!;

  it('accepts only :free OpenRouter ids', () => {
    expect(isFreeModel(openrouter, 'deepseek/deepseek-r1:free')).toBe(true);
    expect(isFreeModel(openrouter, 'anthropic/claude-opus-4.5')).toBe(false);
    // The suffix has to be the suffix — a substring must not pass.
    expect(isFreeModel(openrouter, 'openai/gpt-5.4:free-trial')).toBe(false);
  });

  it('accepts Zen -free ids plus the suffixless exception, minus the retired one', () => {
    expect(isFreeModel(zen, 'hy3-free')).toBe(true);
    expect(isFreeModel(zen, 'big-pickle')).toBe(true);
    expect(isFreeModel(zen, 'qwen3.6-plus-free')).toBe(false);
    expect(isFreeModel(zen, 'claude-sonnet-4.5')).toBe(false);
  });

  it('treats a provider with no predicate as free, and a paid provider as never free', () => {
    expect(isFreeModel(groq, 'llama-3.3-70b-versatile')).toBe(true);
    expect(isFreeModel(openai, 'gpt-5.4')).toBe(false);
  });

  it('filters a model list with the same predicate the gate uses', () => {
    const models = [
      { id: 'a:free', displayName: 'A' },
      { id: 'b', displayName: 'B' },
    ];
    expect(selectFreeModels(openrouter, models).map(m => m.id)).toEqual(['a:free']);
    // No predicate means nothing to filter — the list passes through untouched.
    expect(selectFreeModels(groq, models)).toEqual(models);
  });
});
