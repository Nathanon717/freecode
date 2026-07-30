import {
  endProviderUsageCapture,
  getLastCapturedHeaders,
  type CapturedProviderUsage,
} from '../providers/adapters/openai-compat.js';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import { log } from '../logger.js';

export interface UsageOutcome {
  /** Always present; empty when the provider reported no usage. */
  providerUsage: CapturedProviderUsage[];
  promptTokens?: number;
  outputTokens?: number;
  quota: RateLimitSnapshot | null;
}

/**
 * End any active usage capture for the provider and read captured rate-limit
 * headers. Shared by the success and error paths of agentLoop so partial
 * usage/quota metadata survives stream failures.
 */
export async function finalizeUsageCapture(
  providerId: string,
  promptTokens: number | undefined,
  outputTokens: number | undefined,
): Promise<UsageOutcome> {
  let quota: RateLimitSnapshot | null = null;

  const providerUsage = await endProviderUsageCapture(providerId);
  if (providerUsage.length > 0) {
    log('stream', 'Provider usage captured', providerUsage);
  }

  if (process.env['DEBUG_QUOTA'] !== '0') {
    quota = getLastCapturedHeaders(providerId);
    if (quota) log('quota', `Rate limit headers captured`, quota);
    else log('quota', `No rate limit headers captured for ${providerId}`);
  }

  return { providerUsage, promptTokens, outputTokens, quota };
}
