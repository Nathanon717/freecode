import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/providers/adapters/openai-compat.js', () => ({
  endProviderUsageCapture: vi.fn(),
  getLastCapturedHeaders: vi.fn(),
}));
vi.mock('../../src/providers/adapters/anthropic.js', () => ({
  endAnthropicUsageCapture: vi.fn(),
  getLastCapturedAnthropicHeaders: vi.fn(),
}));
vi.mock('../../src/providers/anthropic-cost.js', () => ({
  estimateAnthropicCostVerified: vi.fn(),
}));
vi.mock('../../src/providers/pricing-verifier.js', () => ({
  getAnthropicVerifiedRates: vi.fn(),
}));
vi.mock('../../src/logger.js', () => ({ log: vi.fn(), logError: vi.fn() }));

import { finalizeUsageCapture } from '../../src/agent/usage-finalize.js';
import { endProviderUsageCapture, getLastCapturedHeaders } from '../../src/providers/adapters/openai-compat.js';
import { endAnthropicUsageCapture, getLastCapturedAnthropicHeaders } from '../../src/providers/adapters/anthropic.js';
import { estimateAnthropicCostVerified } from '../../src/providers/anthropic-cost.js';
import { getAnthropicVerifiedRates } from '../../src/providers/pricing-verifier.js';

const prevDebugQuota = process.env['DEBUG_QUOTA'];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['DEBUG_QUOTA'];
});

afterEach(() => {
  if (prevDebugQuota === undefined) delete process.env['DEBUG_QUOTA'];
  else process.env['DEBUG_QUOTA'] = prevDebugQuota;
});

describe('finalizeUsageCapture — non-Anthropic providers', () => {
  it('keeps the passed prompt/output tokens and reads generic provider usage + quota', async () => {
    const captured = [{ providerId: 'groq', model: 'llama', source: 'sse', usage: {}, capturedAt: 1 }];
    vi.mocked(endProviderUsageCapture).mockResolvedValue(captured as never);
    vi.mocked(getLastCapturedHeaders).mockReturnValue([{ label: 'R', remaining: 5, limit: 10 }] as never);

    const outcome = await finalizeUsageCapture('groq', 'llama-3.3', 1234, 56);

    expect(outcome.promptTokens).toBe(1234); // untouched — the stream number stands
    expect(outcome.outputTokens).toBe(56);
    expect(outcome.providerUsage).toBe(captured);
    expect(outcome.costEstimate).toBeUndefined(); // cost only estimated for Anthropic
    expect(outcome.quota).toEqual([{ label: 'R', remaining: 5, limit: 10 }]);
    // Anthropic paths never touched for a non-Anthropic provider.
    expect(endAnthropicUsageCapture).not.toHaveBeenCalled();
  });

  it('suppresses quota reads when DEBUG_QUOTA=0', async () => {
    process.env['DEBUG_QUOTA'] = '0';
    vi.mocked(endProviderUsageCapture).mockResolvedValue([] as never);

    const outcome = await finalizeUsageCapture('groq', 'llama-3.3', 10, 2);

    expect(outcome.quota).toBeNull();
    expect(getLastCapturedHeaders).not.toHaveBeenCalled();
  });
});

describe('finalizeUsageCapture — Anthropic', () => {
  it('overrides prompt/output tokens with Anthropic-reported values and attaches a cost estimate', async () => {
    vi.mocked(endAnthropicUsageCapture).mockResolvedValue({ inputTokens: 9000, outputTokens: 300 } as never);
    vi.mocked(getAnthropicVerifiedRates).mockResolvedValue({} as never);
    vi.mocked(estimateAnthropicCostVerified).mockReturnValue({ usd: 0.12 } as never);
    vi.mocked(getLastCapturedAnthropicHeaders).mockReturnValue(null);

    const outcome = await finalizeUsageCapture('anthropic', 'claude-3', 5, 1);

    // Anthropic's own numbers win over the (stale) passed-in stream values.
    expect(outcome.promptTokens).toBe(9000);
    expect(outcome.outputTokens).toBe(300);
    expect(outcome.costEstimate).toEqual({ usd: 0.12 });
    expect(outcome.providerUsage).toHaveLength(1);
  });
});
