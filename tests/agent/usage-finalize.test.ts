import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/providers/adapters/openai-compat.js', () => ({
  endProviderUsageCapture: vi.fn(),
  getLastCapturedHeaders: vi.fn(),
}));
vi.mock('../../src/logger.js', () => ({ log: vi.fn(), logError: vi.fn() }));

import { finalizeUsageCapture } from '../../src/agent/usage-finalize.js';
import { endProviderUsageCapture, getLastCapturedHeaders } from '../../src/providers/adapters/openai-compat.js';

const prevDebugQuota = process.env['DEBUG_QUOTA'];

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['DEBUG_QUOTA'];
});

afterEach(() => {
  if (prevDebugQuota === undefined) delete process.env['DEBUG_QUOTA'];
  else process.env['DEBUG_QUOTA'] = prevDebugQuota;
});

describe('finalizeUsageCapture', () => {
  it('passes promptTokens/outputTokens through untouched and reads provider usage + quota', async () => {
    const captured = [{ providerId: 'groq', model: 'llama', source: 'sse', usage: {}, capturedAt: 1 }];
    vi.mocked(endProviderUsageCapture).mockResolvedValue(captured as never);
    vi.mocked(getLastCapturedHeaders).mockReturnValue([{ label: 'R', remaining: 5, limit: 10 }] as never);

    const outcome = await finalizeUsageCapture('groq', 1234, 56);

    expect(outcome.promptTokens).toBe(1234);
    expect(outcome.outputTokens).toBe(56);
    expect(outcome.providerUsage).toBe(captured);
    expect(outcome.quota).toEqual([{ label: 'R', remaining: 5, limit: 10 }]);
    expect(endProviderUsageCapture).toHaveBeenCalledWith('groq');
    expect(getLastCapturedHeaders).toHaveBeenCalledWith('groq');
  });

  it('returns an empty providerUsage array when nothing was captured', async () => {
    vi.mocked(endProviderUsageCapture).mockResolvedValue([] as never);
    vi.mocked(getLastCapturedHeaders).mockReturnValue(null);

    const outcome = await finalizeUsageCapture('openai', 10, 2);

    expect(outcome.providerUsage).toEqual([]);
    expect(outcome.quota).toBeNull();
  });

  it('suppresses quota reads when DEBUG_QUOTA=0', async () => {
    process.env['DEBUG_QUOTA'] = '0';
    vi.mocked(endProviderUsageCapture).mockResolvedValue([] as never);

    const outcome = await finalizeUsageCapture('groq', 10, 2);

    expect(outcome.quota).toBeNull();
    expect(getLastCapturedHeaders).not.toHaveBeenCalled();
  });

  it('reads quota headers when DEBUG_QUOTA is unset', async () => {
    vi.mocked(endProviderUsageCapture).mockResolvedValue([] as never);
    vi.mocked(getLastCapturedHeaders).mockReturnValue([{ label: 'R', remaining: 1, limit: 1 }] as never);

    const outcome = await finalizeUsageCapture('groq', 10, 2);

    expect(getLastCapturedHeaders).toHaveBeenCalled();
    expect(outcome.quota).toEqual([{ label: 'R', remaining: 1, limit: 1 }]);
  });

  it('passes through undefined promptTokens/outputTokens', async () => {
    vi.mocked(endProviderUsageCapture).mockResolvedValue([] as never);
    vi.mocked(getLastCapturedHeaders).mockReturnValue(null);

    const outcome = await finalizeUsageCapture('groq', undefined, undefined);

    expect(outcome.promptTokens).toBeUndefined();
    expect(outcome.outputTokens).toBeUndefined();
  });
});
