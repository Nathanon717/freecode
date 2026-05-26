import chalk from 'chalk';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import type { OpenAIDailySpend } from './openai-daily-spend.js';
import { getBannerColor } from './banner.js';

const ESC = '\x1b[';

let footerActive = false;
let inputUIActive = false;
let footerTimerSuspended = false;
let lastReservedRows = 2;
let lastInputBuf = '';
let lastTokenCount = 0;
let lastSuggestions: string[] = [];
let lastInlineCompletion: string | null = null;
let lastQuota: { quota: RateLimitSnapshot; capturedAt: number } | null = null;
let lastModelStatus = '';
let lastOpenAIDailySpend: OpenAIDailySpend = { state: 'idle', updatedAt: 0 };
let refreshTimer: ReturnType<typeof setInterval> | null = null;

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

let lastPreflightInputCost: PreflightInputCost = {
  state: 'idle',
  providerId: '',
  modelId: '',
  updatedAt: 0,
};

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
  return inputUIActive;
}

export function isFooterUIActive(): boolean {
  return footerActive;
}

export function suspendFooterTimer(): void { footerTimerSuspended = true; }
export function resumeFooterTimer(): void { footerTimerSuspended = false; }

export function getRows(): number { return rows(); }
export function getLastReservedRows(): number { return lastReservedRows; }

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

export function setPreflightInputCost(snapshot: PreflightInputCost): void {
  lastPreflightInputCost = snapshot;
}

export function setOpenAIDailySpend(snapshot: OpenAIDailySpend): void {
  lastOpenAIDailySpend = snapshot;
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

function fitStatusRightSide(width: number, parts: string[], now = Date.now()): string {
  const nonEmptyParts = parts.filter(Boolean);
  const rightStr = nonEmptyParts.join(' | ');
  if (rightStr.length <= width) return rightStr;

  const modelStr = parts[0] ?? '';
  const dailySpendStr = parts.length >= 4 ? parts[1] ?? '' : '';
  const preflightStr = parts.length >= 4 ? parts[2] ?? '' : parts.length >= 3 ? parts[1] ?? '' : '';
  const statusStr = nonEmptyParts[nonEmptyParts.length - 1] ?? '';
  const tokenStr = `${padNumberText(lastTokenCount.toString(), 5)} ctx tokens`;

  const withoutPreflight = [modelStr, dailySpendStr, statusStr].filter(Boolean).join(' | ');
  if (withoutPreflight.length <= width) return withoutPreflight;

  const withoutPreflightAndSpend = [modelStr, statusStr].filter(Boolean).join(' | ');
  if (withoutPreflightAndSpend.length <= width) return withoutPreflightAndSpend;

  const modelWithTokens = [modelStr, tokenStr].filter(Boolean).join(' | ');
  if (modelWithTokens.length <= width) return modelWithTokens;

  if (modelStr.length <= width) return modelStr;
  return modelStr.slice(0, width);
}

export function composeBottomRightStatus(width: number, now = Date.now()): string {
  const quotaStr = formatQuotaStatus(now);
  const dailySpendStr = formatOpenAIDailySpend();
  const preflightStr = formatPreflightInputCost();
  const tokenStr = `${padNumberText(lastTokenCount.toString(), 5)} ctx tokens`;
  const statusStr = quotaStr ? `${quotaStr} | ${tokenStr}` : tokenStr;
  return fitStatusRightSide(width, [lastModelStatus, dailySpendStr, preflightStr, statusStr], now);
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

// Returns the footer escape sequence without writing it.
export function composeFooterOutput(): string {
  if (!footerActive) return '';
  const w = cols();
  const r = rows();
  const rightStr = composeBottomRightStatus(Math.max(0, w - 1));
  const padding = Math.max(0, w - 1 - rightStr.length);
  let output = '';
  output += '\x1b[s'; // save cursor
  output += moveToSequence(r - 1, 1) + clearLineSequence();
  output += moveToSequence(r, 1) + ' '.repeat(padding) + chalk.gray(rightStr);
  output += '\x1b[u'; // restore cursor
  return output;
}

// Draws the two footer rows (r-1 blank, r status line). Saves and restores the cursor position.
export function drawFooter() {
  const output = composeFooterOutput();
  if (output) process.stdout.write(output);
}

// Draws the three input-area rows (top bar, input line, bottom bar) plus any suggestion rows.
// Leaves the cursor on the input line.
function drawInputArea() {
  if (!inputUIActive) return;
  const w = cols();
  const r = rows();
  const n = lastSuggestions.length;
  const reserved = 5 + n;
  const prevReserved = lastReservedRows;

  if (reserved !== prevReserved) {
    setScrollRegion(1, r - reserved);
    lastReservedRows = reserved;
  }

  const topBarRow = r - 4;
  const inputRow = r - 3;
  const bottomBarRow = r - 2;

  // Clear all input-area + suggestion rows (never touch footer rows r-1 and r).
  const toClearRows = Math.max(reserved, prevReserved) - 2;
  let output = '';
  for (let i = 0; i < toClearRows; i++) {
    output += moveToSequence(r - 2 - toClearRows + 1 + i, 1) + clearLineSequence();
  }

  // Suggestions sit above the top bar.
  for (let i = 0; i < n; i++) {
    output += moveToSequence(topBarRow - n + i, 1) + chalk.gray('  ' + lastSuggestions[i]);
  }

  output += moveToSequence(topBarRow, 1) + getBannerColor()('─'.repeat(w));

  const inlineSuffix = getInlineCompletionSuffix(lastInputBuf, lastInlineCompletion);
  const inputText = lastInputBuf
    ? lastInputBuf + chalk.gray(inlineSuffix)
    : chalk.gray('/ for commands');
  output += moveToSequence(inputRow, 1) + getBannerColor()('> ') + inputText;

  output += moveToSequence(bottomBarRow, 1) + getBannerColor()('─'.repeat(w));

  // Park cursor at the typing position.
  output += moveToSequence(inputRow, 3 + lastInputBuf.length);

  process.stdout.write(output);
}

export function drawBottomUI() {
  drawFooter();
  drawInputArea();
}

export function printTurnDivider() {
  process.stdout.write(chalk.gray('─'.repeat(cols())) + '\n');
}

export function parkCursorInScrollRegion() {
  if (!footerActive) return;
  moveTo(rows() - lastReservedRows, 1);
}

export function parkCursorAboveBottomUI() {
  moveTo(Math.max(1, rows() - lastReservedRows), 1);
}

// --- Setup / teardown ---------------------------------------------------------

// Sets up the footer (bottom 2 rows). Stays active across agent runs.
export function setupFooterUI() {
  if (footerActive) return;
  footerActive = true;
  lastReservedRows = 2;
  refreshTimer = setInterval(() => {
    if (footerActive && !footerTimerSuspended) {
      drawFooter();
      if (inputUIActive) drawInputArea();
    }
  }, 1000);
  setScrollRegion(1, rows() - 2);
  drawFooter();
}

// Sets up the input area (3 rows above footer). Call after setupFooterUI.
export function setupInputUI() {
  if (inputUIActive) return;
  inputUIActive = true;
  const r = rows();
  const n = lastSuggestions.length;
  const reserved = 5 + n;
  // Scroll the current scroll region (1 to r-2) up by 3 rows so that any command
  // output near the bottom is not overwritten when the input area rows are drawn.
  process.stdout.write(`${ESC}${r - 2};1H\n\n\n`);
  setScrollRegion(1, r - reserved);
  lastReservedRows = reserved;
  drawInputArea();
}

// Convenience: sets up footer + input together.
export function setupBottomUI() {
  setupFooterUI();
  setupInputUI();
}

// Tears down the input area only. Footer stays active.
export function teardownBottomUI() {
  if (!inputUIActive) return;
  inputUIActive = false;
  const r = rows();
  const toClearRows = lastReservedRows - 2;
  let output = '';
  for (let i = 0; i < toClearRows; i++) {
    output += moveToSequence(r - 2 - toClearRows + 1 + i, 1) + clearLineSequence();
  }
  setScrollRegion(1, r - 2);
  lastReservedRows = 2;
  process.stdout.write(output);
}

// Tears down everything (footer + input). Use on process exit.
export function teardownFooterUI() {
  teardownBottomUI();
  if (!footerActive) return;
  footerActive = false;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  const r = rows();
  let output = '';
  output += moveToSequence(r - 1, 1) + clearLineSequence();
  output += moveToSequence(r, 1) + clearLineSequence();
  output += `${ESC}r`;
  output += moveToSequence(r - 2, 1);
  process.stdout.write(output);
}

// Clears and redraws the input area after a prompt is submitted.
// The footer rows are left untouched.
export function resetSubmittedInputArea() {
  if (!inputUIActive) return;
  const r = rows();
  const n = lastSuggestions.length;
  const reserved = 5 + n;
  if (lastReservedRows !== reserved) {
    setScrollRegion(1, r - reserved);
    lastReservedRows = reserved;
  }
  const toClear = reserved - 2;
  let output = '';
  for (let i = 0; i < toClear; i++) {
    output += moveToSequence(r - 2 - toClear + 1 + i, 1) + clearLineSequence();
  }
  process.stdout.write(output);
  drawInputArea();
}

process.stdout.on('resize', () => {
  if (!footerActive) return;
  setScrollRegion(1, rows() - lastReservedRows);
  drawBottomUI();
});

process.on('exit', () => {
  if (footerActive || inputUIActive) {
    resetScrollRegion();
    moveTo(rows(), 1);
  }
});
