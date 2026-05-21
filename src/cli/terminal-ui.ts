import chalk from 'chalk';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';

const ESC = '\x1b[';

let bottomActive = false;
let lastReservedRows = 2;
let lastInputBuf = '';
let lastTokenCount = 0;
let lastSuggestions: string[] = [];
let lastInlineCompletion: string | null = null;
let lastQuota: { quota: RateLimitSnapshot; capturedAt: number } | null = null;
let lastModelStatus = '';
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function rows(): number { return process.stdout.rows || 24; }
function cols(): number { return process.stdout.columns || 80; }

function setScrollRegion(top: number, bottom: number) {
  process.stdout.write(`${ESC}${top};${bottom}r`);
}

function resetScrollRegion() {
  process.stdout.write(`${ESC}r`);
}

function moveToSequence(row: number, col: number): string {
  return `${ESC}${row};${col}H`;
}

function moveTo(row: number, col: number) {
  process.stdout.write(moveToSequence(row, col));
}

function clearLineSequence(): string {
  return `${ESC}2K`;
}

function clearLine() {
  process.stdout.write(clearLineSequence());
}

export function isBottomUIActive(): boolean {
  return bottomActive;
}

export function getInputBuffer(): string {
  return lastInputBuf;
}

export function setInputBuffer(input: string): void {
  lastInputBuf = input;
}

export function appendToInputBuffer(input: string): void {
  lastInputBuf += input;
}

export function backspaceInputBuffer(): void {
  lastInputBuf = lastInputBuf.slice(0, -1);
}

export function setTokenCount(tokenCount: number): void {
  lastTokenCount = tokenCount;
}

export function setQuotaSnapshot(quota: RateLimitSnapshot | null): void {
  lastQuota = quota ? { quota, capturedAt: Date.now() } : null;
}

export function setModelStatus(providerId: string, modelId: string): void {
  lastModelStatus = providerId || modelId ? `${providerId} - ${modelId}` : '';
}

export function setSuggestions(suggestions: string[]): void {
  lastSuggestions = suggestions;
}

export function setInlineCompletion(completion: string | null): void {
  lastInlineCompletion = completion;
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

function fitStatusRightSide(width: number, parts: string[], now = Date.now()): string {
  const nonEmptyParts = parts.filter(Boolean);
  let rightStr = nonEmptyParts.join(' | ');
  if (rightStr.length <= width) return rightStr;

  const statusStr = nonEmptyParts[nonEmptyParts.length - 1] ?? '';
  if (statusStr.length <= width) return statusStr;

  const tokenStr = `${padNumberText(lastTokenCount.toString(), 5)} ctx tokens`;
  if (tokenStr.length >= width) return tokenStr.slice(0, width);

  const quotaStr = formatQuotaStatus(now);
  const separator = ' | ';
  const availableQuotaWidth = Math.max(0, width - tokenStr.length - separator.length);
  if (!quotaStr || availableQuotaWidth === 0) return tokenStr;

  return `${quotaStr.slice(0, availableQuotaWidth)}${separator}${tokenStr}`;
}

export function composeBottomRightStatus(width: number, now = Date.now()): string {
  const quotaStr = formatQuotaStatus(now);
  const tokenStr = `${padNumberText(lastTokenCount.toString(), 5)} ctx tokens`;
  const statusStr = quotaStr ? `${quotaStr} | ${tokenStr}` : tokenStr;
  return fitStatusRightSide(width, [lastModelStatus, statusStr], now);
}

export function composeBottomStatusLine(width: number, now = Date.now()): string {
  const availableRightWidth = Math.max(0, width - 1);
  const rightStr = composeBottomRightStatus(availableRightWidth, now);
  const padding = Math.max(0, width - 1 - rightStr.length);
  return ' '.repeat(padding) + rightStr;
}

export function getInlineCompletionSuffix(input: string, completion: string | null): string {
  if (!completion || !completion.toLowerCase().startsWith(input.toLowerCase())) return '';
  return completion.slice(input.length);
}

export function drawBottomUI() {
  if (!bottomActive) return;
  const w = cols();
  const r = rows();
  const n = lastSuggestions.length;
  const reserved = 2 + n;
  const prevReserved = lastReservedRows;

  if (reserved !== prevReserved) {
    setScrollRegion(1, r - reserved);
    lastReservedRows = reserved;
  }

  const inputRow = r - 1;
  const statusRow = r;
  const toClear = Math.max(reserved, prevReserved);
  let output = '';
  for (let i = 0; i < toClear; i++) {
    output += moveToSequence(r - toClear + 1 + i, 1) + clearLineSequence();
  }

  for (let i = 0; i < n; i++) {
    output += moveToSequence(inputRow - n + i, 1) + chalk.gray('  ' + lastSuggestions[i]);
  }

  const inlineSuffix = getInlineCompletionSuffix(lastInputBuf, lastInlineCompletion);
  const inputText = lastInputBuf
    ? lastInputBuf + chalk.gray(inlineSuffix)
    : chalk.gray('/ for commands');
  output += moveToSequence(inputRow, 1) + chalk.green('> ') + inputText;

  const availableRightWidth = Math.max(0, w - 1);
  const rightStr = composeBottomRightStatus(availableRightWidth);
  const padding = Math.max(0, w - 1 - rightStr.length);
  output += moveToSequence(statusRow, 1) + ' '.repeat(padding) + chalk.gray(rightStr);
  output += moveToSequence(inputRow, 3 + lastInputBuf.length);

  process.stdout.write(output);
}

export function parkCursorInScrollRegion() {
  if (!bottomActive) return;
  moveTo(rows() - lastReservedRows, 1);
}

export function setupBottomUI() {
  if (bottomActive) return;
  bottomActive = true;
  lastReservedRows = 2;
  refreshTimer = setInterval(() => {
    if (bottomActive) drawBottomUI();
  }, 1000);
  setScrollRegion(1, rows() - 2);
  moveTo(rows() - 2, 1);
  drawBottomUI();
}

export function teardownBottomUI() {
  if (!bottomActive) return;
  bottomActive = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  resetScrollRegion();
  moveTo(rows(), 1);
  process.stdout.write('\n');
}

export function resetSubmittedInputArea() {
  if (lastReservedRows !== 2) {
    setScrollRegion(1, rows() - 2);
    lastReservedRows = 2;
  }
  moveTo(rows() - 1, 1);
  clearLine();
  moveTo(rows(), 1);
  clearLine();
}

process.stdout.on('resize', () => {
  if (!bottomActive) return;
  setScrollRegion(1, rows() - lastReservedRows);
  drawBottomUI();
});

process.on('exit', () => {
  if (bottomActive) {
    resetScrollRegion();
    moveTo(rows(), 1);
  }
});
