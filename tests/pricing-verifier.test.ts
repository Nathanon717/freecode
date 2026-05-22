import { describe, expect, it, vi } from 'vitest';
import { buildAllItemLines } from '../src/commands/model.js';
import { getAnthropicVerifiedRates } from '../src/providers/pricing-verifier.js';

function mockPricingFetches(litellmEntries: Record<string, { input: number; output: number }>, openrouterEntries: Record<string, { input: number; output: number }>): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('litellm')) {
      const json = Object.fromEntries(Object.entries(litellmEntries).map(([key, rate]) => [
        key,
        {
          input_cost_per_token: rate.input / 1_000_000,
          output_cost_per_token: rate.output / 1_000_000,
        },
      ]));
      return new Response(JSON.stringify(json), { status: 200 });
    }

    const data = Object.entries(openrouterEntries).map(([id, rate]) => ({
      id,
      pricing: {
        prompt: String(rate.input / 1_000_000),
        completion: String(rate.output / 1_000_000),
      },
    }));
    return new Response(JSON.stringify({ data }), { status: 200 });
  }));
}

describe('pricing verifier', () => {
  it('matches Anthropic date-suffixed IDs across hyphenated LiteLLM and dotted OpenRouter keys', async () => {
    mockPricingFetches(
      { 'claude-opus-4-5': { input: 5, output: 25 } },
      { 'anthropic/claude-opus-4.5': { input: 5, output: 25 } },
    );

    await expect(getAnthropicVerifiedRates('claude-opus-4-5-20251101')).resolves.toEqual({
      confidence: 'agreed',
      inputPerMillion: 5,
      outputPerMillion: 25,
    });
  });
});

describe('model menu pricing badges', () => {
  it('renders pricing disagreements instead of silently omitting the badge', () => {
    const { itemLines } = buildAllItemLines([
      {
        providerId: 'anthropic',
        providerName: 'Anthropic',
        modelId: 'claude-opus-4-5-20251101',
        displayName: 'Claude Opus 4.5',
        pricing: { input: null, output: null, confidence: 'disagree' },
      },
    ], 0, 'anthropic:other', new Map());

    expect(itemLines.join('\n')).toContain('sources disagree');
  });
});
