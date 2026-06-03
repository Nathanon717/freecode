import chalk from 'chalk';
import type { RateLimitSnapshot } from '../providers/quota/headers.js';
import type { OpenAIDailySpend } from './openai-daily-spend.js';
import { getBannerColor } from './banner.js';

const ESC = '\x1b[';

let footerActive = false;
let inputUIActive = false;
let footerTimerSuspended = false;
let footerRowCount = 2;
let lastReservedRows = 2;
let lastInputBuf = '';
let lastTokenCount = 0;
let lastSuggestions: string[] = [];
let lastInlineCompletion: string | null = null;
let lastQuota: { quota: RateLimitSnapshot; capturedAt: number } | null = null;
let lastModelStatus = '';
let lastOpenAIDailySpend: OpenAIDailySpend = { state: 'idle', updatedAt: 0 };
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let evalRunLabel: string | null = null;
let evalRunStart = 0;
let retryBannerInfo: { name: string; label: string; targetMs: number } | null = null;

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

function setScrollRegionSequence(top: number, bottom: number): string {
  return `${ESC}${top};${bottom}r`;
}

function setScrollRegion(top: number, bottom: number) {
  process.stdout.write(setScrollRegionSequence(top, bottom));
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

export function setEvalRunning(label: string | null): void {
  evalRunLabel = label;
  if (label !== null) evalRunStart = Date.now();
}

export function setRetryBanner(info: { name: string; label: string; targetMs: number } | null): void {
  retryBannerInfo = info;
}

function formatEvalRunStatus(now = Date.now()): string {
  if (retryBannerInfo) {
    const remaining = Math.max(0, Math.ceil((retryBannerInfo.targetMs - now) / 1000));
    if (remaining <= 0) return `${retryBannerInfo.name} ${retryBannerInfo.label} — retrying now...`;
    return `${retryBannerInfo.name} ${retryBannerInfo.label} — retrying in ${remaining}s...`;
  }
  if (!evalRunLabel) return '';
  const elapsed = Math.floor((now - evalRunStart) / 1000);
  return `eval: ${evalRunLabel} · ${elapsed}s`;
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
function layoutFooterRightRows(width: number, rowBudget: number, now = Date.now()): string[] {
  const quotaStr = formatQuotaStatus(now);
  const tokenStr = `${padNumberText(lastTokenCount.toString(), 5)} ctx`;
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

export function getInlineCompletionSuffix(input: string, completion: string | null): string {
  if (!completion || !completion.toLowerCase().startsWith(input.toLowerCase())) return '';
  return completion.slice(input.length);
}

// Returns the footer escape sequence without writing it.
// Uses row r-1 (and optionally r-2) for secondary/tertiary content when the
// terminal is too narrow to fit everything on the primary row.  The footer
// always reserves at least 2 rows; a 3rd row is only used when input UI is
// not active (to avoid shifting the input area unexpectedly).
export function composeFooterOutput(): string {
  if (!footerActive) return '';
  const w = cols();
  const r = rows();
  const now = Date.now();
  const leftStr = formatEvalRunStatus(now);

  // When input is active cap at 2 rows so the input area is not disturbed.
  const maxRows = inputUIActive ? 2 : 3;
  const rightRows = layoutFooterRightRows(Math.max(0, w - 1), maxRows, now);
  const neededCount = Math.max(2, rightRows.length);

  let output = '';
  output += '\x1b[s'; // save cursor

  if (neededCount !== footerRowCount) {
    footerRowCount = neededCount;
    if (inputUIActive) {
      const n = lastSuggestions.length;
      const reserved = footerRowCount + 3 + n;
      output += setScrollRegionSequence(1, r - reserved);
      lastReservedRows = reserved;
    } else {
      output += setScrollRegionSequence(1, r - footerRowCount);
      lastReservedRows = footerRowCount;
    }
  }

  // Clear all footer rows.
  for (let i = 0; i < footerRowCount; i++) {
    output += moveToSequence(r - footerRowCount + 1 + i, 1) + clearLineSequence();
  }

  // Draw auxiliary rows above the primary row (index 1 = r-1, index 2 = r-2).
  for (let i = 1; i < rightRows.length; i++) {
    output += moveToSequence(r - i, 1) + chalk.gray(rightRows[i]);
  }

  // Draw primary row (row r): eval status on the left, main status on the right.
  // Clamp primaryRight to the space remaining after leftStr to prevent line overflow.
  const primaryRight = rightRows[0] ?? '';
  const leftUsed = leftStr.length + (leftStr ? 1 : 0);
  const rightAvail = Math.max(0, w - 1 - leftUsed);
  const safeRight = primaryRight.slice(0, rightAvail);
  const middle = Math.max(leftStr ? 1 : 0, w - 1 - leftStr.length - safeRight.length);
  output += moveToSequence(r, 1) + chalk.cyan(leftStr) + ' '.repeat(middle) + chalk.gray(safeRight);

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
  const reserved = footerRowCount + 3 + n;
  const prevReserved = lastReservedRows;

  if (reserved !== prevReserved) {
    setScrollRegion(1, r - reserved);
    lastReservedRows = reserved;
  }

  const topBarRow = r - footerRowCount - 2;
  const inputRow = r - footerRowCount - 1;
  const bottomBarRow = r - footerRowCount;

  // Clear all input-area + suggestion rows (never touch footer rows).
  const toClearRows = Math.max(reserved, prevReserved) - footerRowCount;
  let output = '';
  for (let i = 0; i < toClearRows; i++) {
    output += moveToSequence(r - footerRowCount - toClearRows + 1 + i, 1) + clearLineSequence();
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

// Sets up the footer (bottom 2+ rows). Stays active across agent runs.
export function setupFooterUI() {
  if (footerActive) return;
  footerActive = true;
  footerRowCount = 2;
  lastReservedRows = 2;
  refreshTimer = setInterval(() => {
    if (footerActive) {
      const prevFooterRowCount = footerRowCount;
      drawFooter();
      // Only redraw the input area if the footer row count changed (affects reserved rows).
      // Unconditional redraws park the cursor at the bottom, causing Termux to snap the viewport.
      // Skip input redraw when suspended (e.g. raw picker open) — footer-only updates are safe
      // because composeFooterOutput uses save/restore cursor.
      if (!footerTimerSuspended && inputUIActive && footerRowCount !== prevFooterRowCount) drawInputArea();
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
  const reserved = footerRowCount + 3 + n;
  // Scroll the current scroll region up by 3 rows so that any command output
  // near the bottom is not overwritten when the input area rows are drawn.
  process.stdout.write(`${ESC}${r - footerRowCount};1H\n\n\n`);
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
  const toClearRows = lastReservedRows - footerRowCount;
  let output = '';
  for (let i = 0; i < toClearRows; i++) {
    output += moveToSequence(r - footerRowCount - toClearRows + 1 + i, 1) + clearLineSequence();
  }
  setScrollRegion(1, r - footerRowCount);
  lastReservedRows = footerRowCount;
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
  for (let i = 0; i < footerRowCount; i++) {
    output += moveToSequence(r - footerRowCount + 1 + i, 1) + clearLineSequence();
  }
  output += `${ESC}r`;
  output += moveToSequence(r - footerRowCount, 1);
  process.stdout.write(output);
  footerRowCount = 2;
}

// Clears and redraws the input area after a prompt is submitted.
// The footer rows are left untouched.
export function resetSubmittedInputArea() {
  if (!inputUIActive) return;
  const r = rows();
  const n = lastSuggestions.length;
  const reserved = footerRowCount + 3 + n;
  const prevReserved = lastReservedRows;
  if (reserved !== prevReserved) {
    setScrollRegion(1, r - reserved);
    lastReservedRows = reserved;
  }
  const toClear = Math.max(reserved, prevReserved) - footerRowCount;
  let output = '';
  for (let i = 0; i < toClear; i++) {
    output += moveToSequence(r - footerRowCount - toClear + 1 + i, 1) + clearLineSequence();
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
