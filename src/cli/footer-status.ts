import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import type { OpenAIDailySpend } from './openai-daily-spend.js';

export interface PreflightInputCost {
  state: 'idle' | 'pending' | 'ready' | 'unavailable';
  providerId: string;
  modelId: string;
  inputTokens?: number;
  inputUsd?: number | null;
  formattedInputUsd?: string;
  payloadHash?: string;
  updatedAt: number;
  warning?: string;
}

let lastTokenCount = 0;
let lastQuota: { quota: RateLimitSnapshot; capturedAt: number } | null = null;
let lastModelStatus = '';
let lastOpenAIDailySpend: OpenAIDailySpend = { state: 'idle', updatedAt: 0 };
let lastPreflightInputCost: PreflightInputCost = {
  state: 'idle',
  providerId: '',
  modelId: '',
  updatedAt: 0,
};
let retryBannerInfo: { name: string; label: string; targetMs: number } | null = null;

export function setTokenCount(tokenCount: number): void { lastTokenCount = tokenCount; }
export function setQuotaSnapshot(quota: RateLimitSnapshot | null): void {
  lastQuota = quota ? { quota, capturedAt: Date.now() } : null;
}
export function setModelStatus(providerId: string, modelId: string): void {
  lastModelStatus = providerId && modelId ? `${providerId}:${modelId}` : (providerId || modelId);
}
export function setPreflightInputCost(snapshot: PreflightInputCost): void {
  lastPreflightInputCost = snapshot;
}
export function setOpenAIDailySpend(snapshot: OpenAIDailySpend): void {
  lastOpenAIDailySpend = snapshot;
}
export function setRetryBanner(info: { name: string; label: string; targetMs: number } | null): void {
  retryBannerInfo = info;
}

export function formatEvalRunStatus(now = Date.now()): string {
  if (retryBannerInfo) {
    const remaining = Math.max(0, Math.ceil((retryBannerInfo.targetMs - now) / 1000));
    if (remaining <= 0) return `${retryBannerInfo.name} ${retryBannerInfo.label} — retrying now...`;
    return `${retryBannerInfo.name} ${retryBannerInfo.label} — retrying in ${remaining}s...`;
  }
  return '';
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
  const seconds = totalSeconds - hours * 3600 - minutes * 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join('');
}

function estimateBucket(
  remaining: number | null,
  limit: number | null,
  resetMs: number | null,
  elapsedMs: number
): { remainingText: string; limitText: string; fullInText: string } {
  if (remaining === null || limit === null) {
    return {
      remainingText: '?',
      limitText: limit?.toString() ?? '?',
      fullInText: '?',
    };
  }

  const missing = Math.max(0, limit - remaining);
  const fullInMs = Math.max(0, (resetMs ?? 0) - elapsedMs);
  const refillRate = resetMs && resetMs > 0 && missing > 0 ? missing / resetMs : 0;
  const estimatedRemaining = Math.min(limit, Math.floor(remaining + elapsedMs * refillRate));

  return {
    remainingText: estimatedRemaining.toString(),
    limitText: limit.toString(),
    fullInText: formatDuration(fullInMs),
  };
}

function padNumberText(value: string, width: number): string {
  return value.padStart(Math.max(width, value.length), ' ');
}

function padDurationText(value: string): string {
  return value.padEnd(Math.max(6, value.length), ' ');
}

function formatBucketStatus(prefix: string, bucket: { remainingText: string; limitText: string; fullInText: string }): string {
  const numberWidth = bucket.limitText === '?' ? 1 : bucket.limitText.length;
  const remainingText = padNumberText(bucket.remainingText, numberWidth);
  const fullInText = padDurationText(bucket.fullInText);
  return `${prefix} ${remainingText}/${bucket.limitText} full ${fullInText}`;
}

function formatQuotaStatus(now = Date.now()): string {
  if (!lastQuota) return '';

  const elapsedMs = now - lastQuota.capturedAt;
  const parts: string[] = [];

  for (const bucket of lastQuota.quota) {
    if (bucket.resetMs !== undefined) {
      const est = estimateBucket(bucket.remaining, bucket.limit, bucket.resetMs, elapsedMs);
      parts.push(formatBucketStatus(bucket.label, est));
    } else {
      const remaining = bucket.remaining?.toString() ?? '?';
      const limit = bucket.limit?.toString() ?? '?';
      parts.push(`${bucket.label} ${remaining}/${limit}`);
    }
  }

  return parts.join(' | ');
}

function formatPreflightInputCost(): string {
  if (lastPreflightInputCost.state === 'pending') return 'input tok: counting';
  if (lastPreflightInputCost.state === 'unavailable') {
    const warning = lastPreflightInputCost.warning ? `: ${lastPreflightInputCost.warning}` : '';
    return `input tok failed${warning}`;
  }
  if (lastPreflightInputCost.state === 'idle' && lastPreflightInputCost.warning) {
    return `input tok off: ${lastPreflightInputCost.warning}`;
  }
  if (lastPreflightInputCost.state !== 'ready' || lastPreflightInputCost.inputTokens === undefined) return '';
  const tokenText = `${lastPreflightInputCost.inputTokens.toLocaleString('en-US')} in tok`;
  const costText = lastPreflightInputCost.formattedInputUsd
    ? `${lastPreflightInputCost.formattedInputUsd} input`
    : 'input cost unavailable';
  return `${tokenText} | ${costText}`;
}

function formatOpenAIDailySpend(): string {
  if (lastOpenAIDailySpend.state === 'pending') return 'OpenAI today: loading';
  if (lastOpenAIDailySpend.state === 'idle' && lastOpenAIDailySpend.warning) {
    return `OpenAI spend off: ${lastOpenAIDailySpend.warning}`;
  }
  if (lastOpenAIDailySpend.state === 'unavailable') {
    const warning = lastOpenAIDailySpend.warning ? `: ${lastOpenAIDailySpend.warning}` : '';
    return `OpenAI spend failed${warning}`;
  }
  if (lastOpenAIDailySpend.state !== 'ready') return '';
  return `OpenAI today ${lastOpenAIDailySpend.formattedAmountUsd ?? 'cost unavailable'}`;
}

// Lays out the right-side footer content into 1..rowBudget rows.
// result[0] = bottom (primary) row, result[1] = row above, result[2] = top row.
// Budget=1 matches the old single-row drop behaviour (existing tests rely on this).
export function layoutFooterRightRows(width: number, rowBudget: number, now = Date.now()): string[] {
  const quotaStr = formatQuotaStatus(now);
  const tokenStr = `${lastTokenCount} ctx`;
  const statusStr = quotaStr ? `${quotaStr} | ${tokenStr}` : tokenStr;
  const preflightStr = formatPreflightInputCost();
  const dailySpendStr = formatOpenAIDailySpend();
  const modelStr = lastModelStatus;

  const secondaryParts = [dailySpendStr, preflightStr].filter(Boolean);
  const secondaryStr = secondaryParts.join(' | ');

  // Single-row fallback — drops least-important content progressively.
  function singleRow(): string {
    const full = [modelStr, ...secondaryParts, statusStr].filter(Boolean).join(' | ');
    if (full.length <= width) return full;

    const withoutPreflight = [modelStr, dailySpendStr, statusStr].filter(Boolean).join(' | ');
    if (withoutPreflight.length <= width) return withoutPreflight;

    const withoutSecondary = [modelStr, statusStr].filter(Boolean).join(' | ');
    if (withoutSecondary.length <= width) return withoutSecondary;

    const withTokenOnly = [modelStr, tokenStr].filter(Boolean).join(' | ');
    if (withTokenOnly.length <= width) return withTokenOnly;

    if (modelStr && modelStr.length <= width) return modelStr;
    return (modelStr || tokenStr).slice(0, width);
  }

  if (rowBudget <= 1) return [singleRow()];

  // Multi-row: try fitting everything on the primary row first.
  const full = [modelStr, ...secondaryParts, statusStr].filter(Boolean).join(' | ');
  if (full.length <= width) return [full];

  // Split: primary = model + quota/ctx, secondary row = spend + preflight.
  const primaryStr = [modelStr, statusStr].filter(Boolean).join(' | ');
  if (primaryStr.length <= width) {
    if (!secondaryStr || secondaryStr.length <= width) {
      return secondaryStr ? [primaryStr, secondaryStr] : [primaryStr];
    }
  }

  // Primary still too wide — drop quota to bare ctx on the primary row.
  const minPrimaryStr = [modelStr, tokenStr].filter(Boolean).join(' | ');
  if (minPrimaryStr.length <= width) {
    const upperCombined = [secondaryStr, quotaStr].filter(Boolean).join(' | ');
    if (!upperCombined || upperCombined.length <= width) {
      return upperCombined ? [minPrimaryStr, upperCombined] : [minPrimaryStr];
    }
    // Upper content overflows one row; use a third row if budget allows.
    if (rowBudget >= 3 && quotaStr && quotaStr.length <= width) {
      if (secondaryStr && secondaryStr.length <= width) {
        return [minPrimaryStr, quotaStr, secondaryStr]; // secondary topmost
      }
      return [minPrimaryStr, quotaStr];
    }
    // Budget=2: prefer quota over secondary on the one available upper row.
    if (quotaStr && quotaStr.length <= width) return [minPrimaryStr, quotaStr];
    if (secondaryStr && secondaryStr.length <= width) return [minPrimaryStr, secondaryStr];
    return [minPrimaryStr];
  }

  return [singleRow()];
}

export function composeBottomRightStatus(width: number, now = Date.now()): string {
  return layoutFooterRightRows(width, 1, now)[0];
}

export function composeBottomStatusLine(width: number, now = Date.now()): string {
  const availableRightWidth = Math.max(0, width - 1);
  const rightStr = composeBottomRightStatus(availableRightWidth, now);
  const padding = Math.max(0, width - 1 - rightStr.length);
  return ' '.repeat(padding) + rightStr;
}
