import {
  endProviderUsageCapture,
  getLastCapturedHeaders,
  type CapturedProviderUsage,
} from '../providers/adapters/openai-compat.js';
import {
  endAnthropicUsageCapture,
  getLastCapturedAnthropicHeaders,
} from '../providers/adapters/anthropic.js';
import { estimateAnthropicCostVerified, type CostEstimate } from '../providers/anthropic-cost.js';
import { getAnthropicVerifiedRates } from '../providers/pricing-verifier.js';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import { log } from '../logger.js';

export interface UsageOutcome {
  providerUsage?: CapturedProviderUsage[];
  costEstimate?: CostEstimate;
  promptTokens?: number;
  outputTokens?: number;
  quota: RateLimitSnapshot | null;
}

/**
 * End any active usage capture for the provider, estimate turn cost, and read
 * captured rate-limit headers. Shared by the success and error paths of
 * agentLoop so partial cost/quota metadata survives stream failures.
 */
export async function finalizeUsageCapture(
  providerId: string,
  modelId: string,
  promptTokens: number | undefined,
  outputTokens: number | undefined,
): Promise<UsageOutcome> {
  let providerUsage: CapturedProviderUsage[] | undefined;
  let costEstimate: CostEstimate | undefined;
  let quota: RateLimitSnapshot | null = null;

  if (providerId === 'anthropic') {
    const [anthropicUsage, rates] = await Promise.all([
      endAnthropicUsageCapture(providerId),
      getAnthropicVerifiedRates(modelId),
    ]);
    costEstimate = estimateAnthropicCostVerified(modelId, anthropicUsage, rates);
    promptTokens = anthropicUsage?.inputTokens ?? promptTokens;
    outputTokens = anthropicUsage?.outputTokens ?? outputTokens;
    if (anthropicUsage) {
      providerUsage = [{ providerId, model: modelId, source: 'sse', usage: anthropicUsage, capturedAt: Date.now() }];
    }
    log('stream', 'Anthropic cost estimate', costEstimate);
  } else {
    providerUsage = await endProviderUsageCapture(providerId);
    if (providerUsage.length > 0) {
      log('stream', 'Provider usage captured', providerUsage);
    }
  }

  if (process.env['DEBUG_QUOTA'] !== '0') {
    quota = getLastCapturedHeaders(providerId) ?? getLastCapturedAnthropicHeaders(providerId);
    if (quota) log('quota', `Rate limit headers captured`, quota);
    else log('quota', `No rate limit headers captured for ${providerId}`);
  }

  return { providerUsage, costEstimate, promptTokens, outputTokens, quota };
}
