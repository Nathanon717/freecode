import chalk from 'chalk';
import { stripAnsi, getScreenBufferDisplayLinesForOverlay, startOverlayEpoch } from '../util/screen-buffer.js';
import { getBannerColor } from './banner.js';
import { composeToggleBar, toggleBarWidth } from './toggles.js';
import {
  layoutFooterRightRows,
  formatEvalRunStatus,
} from './footer-status.js';
import {
  getInputBuffer,
  getCursorPos,
  visualRowsForLine,
  cursorToVisualPos,
} from './input-buffer.js';

export {
  setTokenCount,
  setQuotaSnapshot,
  setModelStatus,
  setOpenAIDailySpend,
  setRetryBanner,
  composeBottomRightStatus,
  composeBottomStatusLine,
} from './footer-status.js';
export {
  getInputBuffer,
  setInputBuffer,
  insertAtCursor,
  backspaceAtCursor,
  deleteAtCursor,
  moveCursorLeft,
  moveCursorRight,
  moveCursorHome,
  moveCursorEnd,
  moveCursorUp,
  moveCursorDown,
  visualRowsForLine,
  cursorToVisualPos,
} from './input-buffer.js';

const ESC = '\x1b[';

let footerActive = false;
let inputUIActive = false;
let footerTimerSuspended = false;
let footerRowCount = 2;
let lastReservedRows = 2;
let lastSuggestions: string[] = [];
let lastInlineCompletion: string | null = null;
let suggestionOverlayRows = 0;
let suggestionOverlayStartRow = 0;
let suggestionOverlayRestoreLines: string[] = [];
let refreshTimer: ReturnType<typeof setInterval> | null = null;

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

export function isBottomUIActive(): boolean { return inputUIActive; }
export function isFooterUIActive(): boolean { return footerActive; }

export function suspendFooterTimer(): void { footerTimerSuspended = true; }
export function resumeFooterTimer(): void { footerTimerSuspended = false; }

export function getRows(): number { return rows(); }
export function getLastReservedRows(): number { return lastReservedRows; }

export function setSuggestions(suggestions: string[]): void { lastSuggestions = suggestions; }
export function setInlineCompletion(completion: string | null): void { lastInlineCompletion = completion; }

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
      const reserved = footerRowCount + 2 + inputLineCount();
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

  // Secondary row (r-1): toggle bar on the left, secondary right-content (if any) on the right.
  {
    const toggleBar = composeToggleBar();
    const toggleVis = toggleBarWidth();
    const secRight = rightRows.length > 1 ? rightRows[1] : '';
    const secRightVis = stripAnsi(secRight).length;
    const spacer = Math.max(0, w - 1 - toggleVis - secRightVis);
    output += moveToSequence(r - 1, 1) + toggleBar + ' '.repeat(spacer) + (secRight ? chalk.gray(secRight) : '');
  }
  // Tertiary row(s) (r-2 and above) for any additional overflow content.
  for (let i = 2; i < rightRows.length; i++) {
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

function restoreSuggestionOverlaySequence(startRow: number, rowCount: number, width: number): string {
  let output = '';
  const maxWidth = Math.max(0, width);
  const padRows = Math.max(0, rowCount - suggestionOverlayRestoreLines.length);
  const lines = [
    ...Array.from({ length: padRows }, () => ''),
    ...suggestionOverlayRestoreLines,
  ].slice(-rowCount);
  for (let i = 0; i < rowCount; i++) {
    const line = lines[i] ?? '';
    const visible = stripAnsi(line);
    // Use visible length for truncation so ANSI color bytes don't count as width.
    const content = visible.length <= maxWidth ? line : visible.slice(0, maxWidth);
    output += moveToSequence(startRow + i, 1) + clearLineSequence() + content + (content ? '\x1b[0m' : '');
  }
  return output;
}

function inputLineCount(): number {
  const w = cols();
  return (getInputBuffer() || '').split('\n').reduce(
    (sum, line) => sum + visualRowsForLine(line, w),
    0,
  ) || 1;
}

// Draws the input area (top bar, N input lines, bottom bar) plus any suggestion rows.
// Leaves the cursor on the active input line.
function drawInputArea() {
  if (!inputUIActive) return;
  const w = cols();
  const r = rows();
  const n = lastSuggestions.length;
  const lineCount = inputLineCount();
  const reserved = footerRowCount + 2 + lineCount;
  const prevReserved = lastReservedRows;

  let output = '';
  if (reserved !== prevReserved) {
    if (reserved > prevReserved) {
      // Grow: scroll content up to make room for new input lines.
      output += moveToSequence(r - prevReserved, 1) + '\n'.repeat(reserved - prevReserved);
    } else {
      // Shrink: clear rows that were input area but are now back in scroll region.
      const extraClear = prevReserved - reserved;
      for (let i = 0; i < extraClear; i++) {
        output += moveToSequence(r - prevReserved + 1 + i, 1) + clearLineSequence();
      }
    }
    output += setScrollRegionSequence(1, r - reserved);
    lastReservedRows = reserved;
  }

  const topBarRow = r - footerRowCount - 1 - lineCount;
  const bottomBarRow = r - footerRowCount;
  const suggestionStartRow = topBarRow - n;

  if (suggestionOverlayRows > 0 && suggestionOverlayRows !== n) {
    output += restoreSuggestionOverlaySequence(suggestionOverlayStartRow, suggestionOverlayRows, w);
    suggestionOverlayRows = 0;
    suggestionOverlayRestoreLines = [];
  }

  if (n > 0 && suggestionOverlayRows === 0) {
    suggestionOverlayRows = n;
    suggestionOverlayStartRow = suggestionStartRow;
    const scrollHeight = r - reserved;
    suggestionOverlayRestoreLines = getScreenBufferDisplayLinesForOverlay(n, scrollHeight);
  }

  // Clear the input frame rows (never touch footer rows).
  const toClearRows = reserved - footerRowCount;
  for (let i = 0; i < toClearRows; i++) {
    output += moveToSequence(r - footerRowCount - toClearRows + 1 + i, 1) + clearLineSequence();
  }

  // Suggestions overlay the transcript above the top bar.
  for (let i = 0; i < n; i++) {
    output += moveToSequence(suggestionStartRow + i, 1) + clearLineSequence() + chalk.gray('  ' + lastSuggestions[i]);
  }

  output += moveToSequence(topBarRow, 1) + getBannerColor()('─'.repeat(w));

  // Draw each input line with visual wrapping.
  const inputLines = getInputBuffer() ? getInputBuffer().split('\n') : [''];
  const logicalLineCount = inputLines.length;
  const effW = Math.max(1, w - 2);
  let visualRowOffset = 0;

  for (let i = 0; i < inputLines.length; i++) {
    const logicalPrefix = i === 0 ? getBannerColor()('> ') : '  ';
    const lineContent = inputLines[i];
    const rowsThisLine = Math.floor(lineContent.length / effW) + 1;
    const isLastLogicalLine = i === inputLines.length - 1;

    for (let vi = 0; vi < rowsThisLine; vi++) {
      const chunk = lineContent.slice(vi * effW, (vi + 1) * effW);
      const prefix = vi === 0 ? logicalPrefix : '  ';
      const inputRowCurrent = topBarRow + 1 + visualRowOffset;

      if (vi === 0 && i === 0 && !getInputBuffer()) {
        output += moveToSequence(inputRowCurrent, 1) + prefix + chalk.gray('/ for commands');
      } else {
        const inlineSuffix =
          logicalLineCount === 1 && isLastLogicalLine && vi === rowsThisLine - 1
            ? getInlineCompletionSuffix(getInputBuffer(), lastInlineCompletion)
            : '';
        output += moveToSequence(inputRowCurrent, 1) + prefix + chunk + (inlineSuffix ? chalk.gray(inlineSuffix) : '');
      }
      visualRowOffset++;
    }
  }

  output += moveToSequence(bottomBarRow, 1) + getBannerColor()('─'.repeat(w));

  // Park cursor at the typing position.
  const { visualRow, visualCol } = cursorToVisualPos(getInputBuffer(), getCursorPos(), w);
  output += moveToSequence(topBarRow + 1 + visualRow, 3 + visualCol);

  process.stdout.write(output);
}

export function drawBottomUI() {
  drawFooter();
  drawInputArea();
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

let _overlayEpochStarted = false;

// Sets up the input area (3 rows above footer). Call after setupFooterUI.
export function setupInputUI() {
  if (inputUIActive) return;
  inputUIActive = true;
  if (!_overlayEpochStarted) {
    _overlayEpochStarted = true;
    startOverlayEpoch(); // Exclude pre-UI output (e.g. banner) from overlay repaints.
  }
  const r = rows();
  const reserved = footerRowCount + 3;
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
  const w = cols();
  const toClearRows = lastReservedRows - footerRowCount;
  let output = '';
  if (suggestionOverlayRows > 0) {
    output += restoreSuggestionOverlaySequence(suggestionOverlayStartRow, suggestionOverlayRows, w);
    suggestionOverlayRows = 0;
    suggestionOverlayRestoreLines = [];
  }
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
  const w = cols();
  const reserved = footerRowCount + 2 + inputLineCount();
  const prevReserved = lastReservedRows;
  let output = '';
  if (suggestionOverlayRows > 0) {
    output += restoreSuggestionOverlaySequence(suggestionOverlayStartRow, suggestionOverlayRows, w);
    suggestionOverlayRows = 0;
    suggestionOverlayRestoreLines = [];
  }
  if (reserved !== prevReserved) {
    setScrollRegion(1, r - reserved);
    lastReservedRows = reserved;
  }
  const toClear = Math.max(reserved, prevReserved) - footerRowCount;
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
