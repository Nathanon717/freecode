import { describe, expect, it } from 'vitest';
import {
  describeCostEstimate,
  describeCostEstimateBreakdown,
  estimateAnthropicCost,
  formatUsdCeil,
  parseAnthropicPricingHtml,
  type AnthropicPricingTable,
  type AnthropicTokenUsage,
} from '../../src/providers/anthropic-cost.js';
import {
  mergeAnthropicUsages,
  parseAnthropicUsageFromSse,
} from '../../src/providers/adapters/anthropic.js';

function usage(overrides: Partial<AnthropicTokenUsage> = {}): AnthropicTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheReadInputTokens: 0,
    hasRawUsage: true,
    ...overrides,
  };
}

function table(): AnthropicPricingTable {
  return {
    source: 'fallback',
    sourceUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
    fetchedAt: '2026-05-19T00:00:00.000Z',
    models: {
      'claude-sonnet-4-6': {
        modelName: 'Claude Sonnet 4.6',
        inputPerMillion: 3,
        cacheWrite5mPerMillion: 3.75,
        cacheWrite1hPerMillion: 6,
        cacheReadPerMillion: 0.3,
        outputPerMillion: 15,
      },
    },
  };
}

describe('Anthropic pricing and cost estimates', () => {
  it('parses model pricing rows from Anthropic pricing snippets', () => {
    const parsed = parseAnthropicPricingHtml(`
      Model Base Input Tokens 5m Cache Writes 1h Cache Writes Cache Hits & Refreshes Output Tokens
      Claude Sonnet 4.6$3 / MTok$3.75 / MTok$6 / MTok$0.30 / MTok$15 / MTok
      Claude Haiku 4.5$1 / MTok$1.25 / MTok$2 / MTok$0.10 / MTok$5 / MTok
    `);

    expect(parsed.source).toBe('live');
    expect(parsed.models['claude-sonnet-4-6']).toMatchObject({
      inputPerMillion: 3,
      cacheWrite5mPerMillion: 3.75,
      cacheWrite1hPerMillion: 6,
      cacheReadPerMillion: 0.3,
      outputPerMillion: 15,
    });
    expect(parsed.models['claude-haiku-4-5']?.outputPerMillion).toBe(5);
  });

  it('marks malformed pricing as unavailable instead of estimating zero', () => {
    expect(() => parseAnthropicPricingHtml('no table here')).toThrow(/No Anthropic model pricing rows/);

    const estimate = estimateAnthropicCost('claude-unknown', usage({ inputTokens: 1000 }), table());

    expect(estimate.usd).toBeNull();
    expect(estimate.formattedUsd).toBe('cost unavailable');
    expect(estimate.warnings[0]).toContain('pricing unavailable');
  });

  it('calculates all token categories and the US-only inference multiplier', () => {
    const estimate = estimateAnthropicCost('claude-sonnet-4-6', usage({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreation5mInputTokens: 1_000_000,
      cacheCreation1hInputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      inferenceGeo: 'us',
    }), table());

    expect(estimate.usd).toBeCloseTo((3 + 15 + 3.75 + 6 + 0.3) * 1.1);
    expect(estimate.breakdown?.multiplier).toBe(1.1);
    expect(describeCostEstimate(estimate)).toContain('fallback pricing');
  });

  it('never rounds displayed values down', () => {
    expect(formatUsdCeil(0.0000001)).toBe('$0.000001 USD');
    expect(formatUsdCeil(0.01001)).toBe('$0.0101 USD');
    expect(formatUsdCeil(null)).toBe('cost unavailable');
  });

  it('formats detailed cost breakdowns with tokens, rates, source, and multiplier', () => {
    const estimate = estimateAnthropicCost('claude-sonnet-4-6', usage({
      inputTokens: 1234,
      outputTokens: 56,
      cacheReadInputTokens: 789,
      inferenceGeo: 'us',
    }), table());

    expect(describeCostEstimateBreakdown(estimate)).toBe(
      'Cost breakdown: input 1,234 tok @ $3/MTok = $0.004073 USD + output 56 tok @ $15/MTok = $0.000925 USD + cache read 789 tok @ $0.3/MTok = $0.000261 USD (fallback pricing, 1.1x US inference multiplier)'
    );
  });
});

describe('Anthropic SSE usage parsing', () => {
  it('parses message_start and final message_delta usage', () => {
    const parsed = parseAnthropicUsageFromSse([
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":10,"cache_creation":{"ephemeral_5m_input_tokens":2,"ephemeral_1h_input_tokens":3},"cache_read_input_tokens":4}}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","usage":{"output_tokens":20,"server_tool_use":{"web_search_requests":1}}}',
      '',
    ].join('\n'));

    expect(parsed).toMatchObject({
      inputTokens: 10,
      outputTokens: 20,
      cacheCreation5mInputTokens: 2,
      cacheCreation1hInputTokens: 3,
      cacheReadInputTokens: 4,
      hasRawUsage: true,
    });
    expect(parsed?.serverToolUse?.web_search_requests).toBe(1);
  });

  it('supports legacy cache_creation_input_tokens', () => {
    const parsed = parseAnthropicUsageFromSse([
      'event: message_start',
      'data: {"message":{"usage":{"input_tokens":1,"cache_creation_input_tokens":7}}}',
      '',
      'event: message_delta',
      'data: {"usage":{"output_tokens":2}}',
      '',
    ].join('\n'));

    expect(parsed?.cacheCreationInputTokens).toBe(7);
  });

  it('aggregates multiple Anthropic API calls for one turn', () => {
    const merged = mergeAnthropicUsages([
      usage({ inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 5 }),
      usage({ inputTokens: 30, outputTokens: 40, cacheCreation1hInputTokens: 6 }),
    ]);

    expect(merged).toMatchObject({
      inputTokens: 40,
      outputTokens: 60,
      cacheReadInputTokens: 5,
      cacheCreation1hInputTokens: 6,
      hasRawUsage: true,
    });
  });
});
