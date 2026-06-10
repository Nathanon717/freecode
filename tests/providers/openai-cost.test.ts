import { describe, expect, it } from 'vitest';
import {
  parseLiteLLMPricing,
  estimateOpenAICost,
  estimateOpenAICostVerified,
  estimateOpenAIInputCostVerified,
  resetOpenAISessionCost,
  addOpenAISessionCost,
  getOpenAISessionCost,
} from '../../src/providers/openai-cost.js';
import type { VerifiedRates } from '../../src/providers/pricing-verifier.js';

const LITELLM_SAMPLE = {
  'gpt-4o-2024-08-06': { input_cost_per_token: 0.0000025, output_cost_per_token: 0.00001 },
  'gpt-4o-mini': { input_cost_per_token: 0.00000015, output_cost_per_token: 0.0000006 },
  'o3-2025-04-16': { input_cost_per_token: 0.00001, output_cost_per_token: 0.00004 },
  // Non-OpenAI / provider-prefixed entries that must be filtered out:
  'azure/gpt-4o': { input_cost_per_token: 0.0000025, output_cost_per_token: 0.00001 },
  'claude-3-5-sonnet': { input_cost_per_token: 0.000003, output_cost_per_token: 0.000015 },
  // Missing cost fields must be skipped:
  'gpt-broken': {},
};

describe('parseLiteLLMPricing', () => {
  it('keeps only plain OpenAI entries and converts to per-million rates', () => {
    const table = parseLiteLLMPricing(LITELLM_SAMPLE, '2026-01-01T00:00:00Z');
    expect(table.source).toBe('live');
    expect(table.fetchedAt).toBe('2026-01-01T00:00:00Z');
    expect(table.models['gpt-4o-2024-08-06']).toEqual({ inputPerMillion: 2.5, outputPerMillion: 10 });
    expect(table.models['o3-2025-04-16']).toEqual({ inputPerMillion: 10, outputPerMillion: 40 });
  });

  it('excludes provider-prefixed and non-OpenAI models', () => {
    const table = parseLiteLLMPricing(LITELLM_SAMPLE);
    expect(table.models['azure/gpt-4o']).toBeUndefined();
    expect(table.models['claude-3-5-sonnet']).toBeUndefined();
  });

  it('skips entries missing numeric cost fields', () => {
    const table = parseLiteLLMPricing(LITELLM_SAMPLE);
    expect(table.models['gpt-broken']).toBeUndefined();
  });

  it('throws when there are no OpenAI entries at all', () => {
    expect(() => parseLiteLLMPricing({ 'claude-3': { input_cost_per_token: 1, output_cost_per_token: 2 } }))
      .toThrow('No OpenAI entries');
  });

  it('throws when OpenAI entries exist but none have usable pricing', () => {
    expect(() => parseLiteLLMPricing({ 'gpt-x': {} })).toThrow('No usable OpenAI pricing');
  });
});

describe('estimateOpenAICost', () => {
  const table = parseLiteLLMPricing(LITELLM_SAMPLE);

  it('computes cost for an exact model match', () => {
    const est = estimateOpenAICost('gpt-4o-mini', 1_000_000, 1_000_000, table);
    expect(est.usd).toBeCloseTo(0.15 + 0.6, 10);
    expect(est.source).toBe('live');
    expect(est.warnings).toEqual([]);
  });

  it('prefix-matches a base model id to its only dated LiteLLM key and warns about it', () => {
    // No exact "o3" key exists; it should resolve to "o3-2025-04-16".
    const est = estimateOpenAICost('o3', 1_000_000, 0, table);
    expect(est.usd).toBeCloseTo(10, 10);
    expect(est.warnings.some(w => w.includes('matched o3 to o3-2025-04-16'))).toBe(true);
  });

  it('strips a date suffix from the requested model to find a base key', () => {
    const est = estimateOpenAICost('gpt-4o-mini-20240101', 1_000_000, 0, table);
    expect(est.usd).toBeCloseTo(0.15, 10);
  });

  it('returns unavailable when token usage is missing', () => {
    const est = estimateOpenAICost('gpt-4o-mini', undefined, 5, table);
    expect(est.usd).toBeNull();
    expect(est.warnings).toContain('token usage unavailable');
  });

  it('returns unavailable for an unknown model', () => {
    const est = estimateOpenAICost('totally-unknown', 10, 10, table);
    expect(est.usd).toBeNull();
    expect(est.warnings[0]).toContain('totally-unknown');
  });

  it('returns unavailable when the pricing table itself is unavailable', () => {
    const broken = { source: 'unavailable' as const, fetchedAt: 'now', models: {} };
    const est = estimateOpenAICost('gpt-4o-mini', 10, 10, broken);
    expect(est.usd).toBeNull();
    expect(est.source).toBe('fallback');
  });
});

describe('estimateOpenAICostVerified', () => {
  const rates: VerifiedRates = { inputPerMillion: 2, outputPerMillion: 8, confidence: 'agreed' };

  it('computes a cost when rates agree', () => {
    const est = estimateOpenAICostVerified('gpt-4o', 1_000_000, 1_000_000, rates);
    expect(est.usd).toBeCloseTo(10, 10);
    expect(est.confidence).toBe('agreed');
  });

  it('returns unavailable when sources disagree', () => {
    const disagree: VerifiedRates = { inputPerMillion: 2, outputPerMillion: 8, confidence: 'disagree' };
    const est = estimateOpenAICostVerified('gpt-4o', 1_000_000, 1_000_000, disagree);
    expect(est.usd).toBeNull();
  });

  it('returns unavailable when token usage is missing but keeps confidence', () => {
    const est = estimateOpenAICostVerified('gpt-4o', undefined, undefined, rates);
    expect(est.usd).toBeNull();
    expect(est.warnings).toContain('token usage unavailable');
  });
});

describe('estimateOpenAIInputCostVerified', () => {
  it('computes input-only cost when rates are usable', () => {
    const rates: VerifiedRates = { inputPerMillion: 3, outputPerMillion: 9, confidence: 'agreed' };
    const result = estimateOpenAIInputCostVerified(2_000_000, rates);
    expect(result.inputUsd).toBeCloseTo(6, 10);
    expect(result.warning).toBeUndefined();
  });

  it('returns unavailable when rates are disputed', () => {
    const rates: VerifiedRates = { inputPerMillion: null, outputPerMillion: null, confidence: 'disagree' };
    const result = estimateOpenAIInputCostVerified(2_000_000, rates);
    expect(result.inputUsd).toBeNull();
    expect(result.warning).toBeDefined();
  });
});

describe('OpenAI session cost tracker', () => {
  it('accumulates and resets running session cost', () => {
    resetOpenAISessionCost();
    expect(getOpenAISessionCost()).toBe(0);
    addOpenAISessionCost({ usd: 0.5 } as never);
    addOpenAISessionCost({ usd: 0.25 } as never);
    expect(getOpenAISessionCost()).toBeCloseTo(0.75, 10);
    addOpenAISessionCost({ usd: null } as never);
    addOpenAISessionCost(null);
    expect(getOpenAISessionCost()).toBeCloseTo(0.75, 10);
    resetOpenAISessionCost();
    expect(getOpenAISessionCost()).toBe(0);
  });
});
