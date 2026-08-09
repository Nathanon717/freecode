/**
 * @role Owns the mutable state for the footer status display, all formatting helpers, and the multi-row layout logic.
 *
 * @readwhen
 * Changing what is shown in the footer status area, adding new status fields, or debugging the multi-row layout.
 */

import type { RateLimitSnapshot } from '../../providers/quota/headers.js';
import type { OpenAIDailySpend } from '../../providers/openai-daily-spend.js';

let lastQuota: { quota: RateLimitSnapshot; capturedAt: number } | null = null;
let lastModelStatus = '';
let lastOpenAIDailySpend: OpenAIDailySpend = { state: 'idle', updatedAt: 0 };
let retryBannerInfo: { name: string; label: string; targetMs: number } | null = null;
// The live conversation's context size, as the *provider* reported it — the
// prompt (input) token count of the most recent API call, which already equals
// the whole message history because every call resends it. Latest wins; never a
// running sum (a running sum across eval turns was the old bug). `window` is the model's
// context window when known, else null. null overall = never measured, so the
// footer shows nothing rather than a fabricated estimate.
let lastContextUsage: { tokens: number; window: number | null } | null = null;

export function setQuotaSnapshot(quota: RateLimitSnapshot | null): void {
  lastQuota = quota ? { quota, capturedAt: Date.now() } : null;
}
export function setContextUsage(usage: { tokens: number; window: number | null } | null): void {
  lastContextUsage = usage;
}
export function setActiveModel(providerId: string, modelId: string): void {
  lastModelStatus = providerId && modelId ? `${providerId}:${modelId}` : (providerId || modelId);
}
export function setActiveModelFromString(model: string): void {
  const idx = model.indexOf(':');
  if (idx !== -1) setActiveModel(model.slice(0, idx), model.slice(idx + 1));
  else if (model) setActiveModel('', model);
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

// Raw integers, no thousands separators and no locale formatting: the digits
// must be byte-for-byte deterministic (tests pin them) and never rounded. Shows
// `N/M ctx` when the window is known, `N ctx` otherwise — never `N/0` or a
// percentage, which would invent precision the provider count doesn't carry.
function formatContextStatus(): string {
  if (!lastContextUsage) return '';
  const { tokens, window } = lastContextUsage;
  if (window != null && window > 0) return `${tokens}/${window} ctx`;
  return `${tokens} ctx`;
}

// Lays out the right-side footer content into 1..rowBudget rows.
// result[0] = bottom (primary) row, result[1] = row above, result[2] = top row.
// Budget=1 matches the old single-row drop behaviour (existing tests rely on this).
function joinParts(...parts: string[]): string {
  return parts.filter(Boolean).join(' | ');
}

export function layoutFooterRightRows(width: number, rowBudget: number, now = Date.now()): string[] {
  const quotaStr = formatQuotaStatus(now);
  const dailySpendStr = formatOpenAIDailySpend();
  const ctxStr = formatContextStatus();
  const modelStr = lastModelStatus;

  // The primary row's core content, in decreasing priority: model identity is
  // kept longest, then the context size (the thing this footer exists to show),
  // then quota. `modelCtxStr` is what stays on the primary row once quota is
  // pushed to an upper row. Secondary content (OpenAI spend) drops first.
  const modelCtxStr = joinParts(modelStr, ctxStr);
  const secondaryParts = [dailySpendStr].filter(Boolean);
  const secondaryStr = secondaryParts.join(' | ');

  // Single-row fallback — drops least-important content progressively.
  function singleRow(): string {
    const full = joinParts(modelStr, ctxStr, secondaryStr, quotaStr);
    if (full.length <= width) return full;

    const withoutSecondary = joinParts(modelStr, ctxStr, quotaStr);
    if (withoutSecondary.length <= width) return withoutSecondary;

    const withoutQuota = joinParts(modelStr, ctxStr);
    if (withoutQuota.length <= width) return withoutQuota;

    if (modelStr && modelStr.length <= width) return modelStr;
    return (modelStr || ctxStr || quotaStr).slice(0, width);
  }

  if (rowBudget <= 1) return [singleRow()];

  // Multi-row: try fitting everything on the primary row first.
  const full = joinParts(modelStr, ctxStr, secondaryStr, quotaStr);
  if (full.length <= width) return [full];

  // Split: primary = model + ctx + quota, secondary row = spend.
  const primaryStr = joinParts(modelStr, ctxStr, quotaStr);
  if (primaryStr.length <= width) {
    if (!secondaryStr || secondaryStr.length <= width) {
      return secondaryStr ? [primaryStr, secondaryStr] : [primaryStr];
    }
  }

  // Primary still too wide — drop quota, keep model+ctx on the primary row.
  if (modelCtxStr.length <= width) {
    const upperCombined = joinParts(secondaryStr, quotaStr);
    if (!upperCombined || upperCombined.length <= width) {
      return upperCombined ? [modelCtxStr, upperCombined] : [modelCtxStr];
    }
    // Upper content overflows one row; use a third row if budget allows.
    if (rowBudget >= 3 && quotaStr && quotaStr.length <= width) {
      if (secondaryStr && secondaryStr.length <= width) {
        return [modelCtxStr, quotaStr, secondaryStr]; // secondary topmost
      }
      return [modelCtxStr, quotaStr];
    }
    // Budget=2: prefer quota over secondary on the one available upper row.
    if (quotaStr && quotaStr.length <= width) return [modelCtxStr, quotaStr];
    if (secondaryStr && secondaryStr.length <= width) return [modelCtxStr, secondaryStr];
    return [modelCtxStr];
  }

  return [singleRow()];
}
