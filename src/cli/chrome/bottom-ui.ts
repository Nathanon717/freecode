/**
 * @role Renders and controls the bottom-pinned prompt/status area. Owns only the ANSI scroll-region state and the input-area layout; the state it draws lives in sibling modules, which callers import directly — this module does not re-export them.
 *
 * @readwhen
 * - Debugging idle footer timer output snapping the Termux viewport (lastFooterOutput byte-compare skip).
 * - Fixing terminal resize reflow ghost rows from the cursor-addressed input frame (SIGWINCH scrub).
 * - Changing reserved-row geometry shared by footer, input frame, suggestions overlay, and thinking label.
 */

import chalk from 'chalk';
import { stripAnsi, composeScrollRegionScrub, hasPostEpochContent, startOverlayEpoch, writeChrome } from '../../util/screen-buffer.js';
import { captureOverlay, composeOverlayRestore, getOverlayRows, resetOverlay } from './suggestion-overlay.js';
import { getBannerColor, clearAndRedrawBanner } from '../render/banner.js';
import { composeToggleBar, toggleBarWidth } from './toggles.js';
import { isTurnActive, composeThinkingLabel, setActivityChangeListener } from './turn-state.js';
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
import { toolNameHighlightRanges, styleToolNames } from '../tools/tool-invocation.js';
import {
  rows,
  cols,
  setScrollRegionSequence,
  setScrollRegion,
  resetScrollRegion,
  resetScrollRegionSequence,
  moveToSequence,
  moveTo,
  clearLineSequence,
  saveCursorSequence,
  restoreCursorSequence,
} from './ansi.js';

let footerActive = false;
let inputUIActive = false;
let footerTimerSuspended = false;
let footerRowCount = 2;
let lastReservedRows = 2;
let lastSuggestions: string[] = [];
let lastInlineCompletion: string | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
// Last footer bytes written to the terminal. The 1 s refresh timer compares the
// freshly-composed footer against this and writes nothing when they are identical,
// so an idle prompt emits no periodic output. Any output byte makes terminals like
// Termux snap the viewport back to the bottom, which fights the user scrolling up
// to read scrollback. Event-driven redraws (setup/teardown/resize) always repaint
// and refresh this value; only the timer skips.
let lastFooterOutput: string | null = null;

export function isBottomUIActive(): boolean { return inputUIActive; }
export function isFooterUIActive(): boolean { return footerActive; }

export function suspendFooterTimer(): void { footerTimerSuspended = true; }
export function resumeFooterTimer(): void { footerTimerSuspended = false; }
/** True while a raw picker or the approval prompt owns rows this module would otherwise draw. */
export function isFooterTimerSuspended(): boolean { return footerTimerSuspended; }

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
  output += saveCursorSequence();

  if (neededCount !== footerRowCount) {
    footerRowCount = neededCount;
    const reserved = reservedRows();
    output += setScrollRegionSequence(1, r - reserved);
    lastReservedRows = reserved;
  }

  // Clear all footer rows.
  for (let i = 0; i < footerRowCount; i++) {
    output += moveToSequence(r - footerRowCount + 1 + i, 1) + clearLineSequence();
  }

  // Secondary row (r-1): toggle bar on the left, secondary right-content (if any) on the right.
  // The toggle bar is part of the input-bar component: it is drawn iff the input bar is shown
  // (inputUIActive), so the two always hide/show together and can't drift apart.
  {
    const toggleBar = inputUIActive ? composeToggleBar() : '';
    const toggleVis = inputUIActive ? toggleBarWidth() : 0;
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

  output += restoreCursorSequence();
  return output;
}

// Draws the two footer rows (r-1 blank, r status line). Saves and restores the cursor position.
export function drawFooter() {
  const output = composeFooterOutput();
  if (output) {
    lastFooterOutput = output;
    process.stdout.write(output);
  }
}

function inputLineCount(): number {
  const w = cols();
  return (getInputBuffer() || '').split('\n').reduce(
    (sum, line) => sum + visualRowsForLine(line, w),
    0,
  ) || 1;
}

// The `thinking…` label takes its own row above the input frame's top divider,
// so it costs a reserved row while it shows. Gated on the input bar being up as
// well as the turn: that is what makes the tool-approval prompt hide the label
// for free, since it tears the input bar down. See `turn-state.ts`.
function showThinking(): boolean {
  return inputUIActive && isTurnActive();
}

// A verb change rewrites the label in place. The row count is unchanged, so this
// repaints rather than moving the scroll region; `drawInputArea` no-ops when the
// input bar is down (tool approval), which is the same gate `showThinking` uses.
setActivityChangeListener(() => drawInputArea());

// Rows the bottom UI holds out of the scroll region. Single source of truth:
// this expression used to be recomputed at five call sites, and any one of them
// disagreeing drifts the scroll region from what is actually drawn.
function reservedRows(): number {
  if (!inputUIActive) return footerRowCount;
  return footerRowCount + 2 + inputLineCount() + (showThinking() ? 1 : 0);
}

// Draws the input area (top bar, N input lines, bottom bar) plus any suggestion rows.
// Leaves the cursor on the active input line.
function drawInputArea() {
  if (!inputUIActive) return;
  const w = cols();
  const r = rows();
  const n = lastSuggestions.length;
  const lineCount = inputLineCount();
  const reserved = reservedRows();
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
  // The label sits above the top divider, so it is the frame's real top row and
  // suggestions stack above *it*. Suggestions can't actually be up mid-turn (no
  // key handling runs), but the geometry has one definition either way.
  const frameTopRow = showThinking() ? topBarRow - 1 : topBarRow;
  const suggestionStartRow = frameTopRow - n;

  if (getOverlayRows() > 0 && getOverlayRows() !== n) output += composeOverlayRestore(w);
  if (n > 0 && getOverlayRows() === 0) captureOverlay(n, suggestionStartRow, r - reserved);

  // Clear the input frame rows (never touch footer rows).
  const toClearRows = reserved - footerRowCount;
  for (let i = 0; i < toClearRows; i++) {
    output += moveToSequence(r - footerRowCount - toClearRows + 1 + i, 1) + clearLineSequence();
  }

  // Suggestions overlay the transcript above the top bar.
  for (let i = 0; i < n; i++) {
    output += moveToSequence(suggestionStartRow + i, 1) + clearLineSequence() + chalk.gray('  ' + lastSuggestions[i]);
  }

  if (showThinking()) {
    output += moveToSequence(topBarRow - 1, 1) + composeThinkingLabel();
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
    const highlightRanges = toolNameHighlightRanges(lineContent);
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
        output += moveToSequence(inputRowCurrent, 1) + prefix + styleToolNames(chunk, vi * effW, highlightRanges) + (inlineSuffix ? chalk.gray(inlineSuffix) : '');
      }
      visualRowOffset++;
    }
  }

  output += moveToSequence(bottomBarRow, 1) + getBannerColor()('─'.repeat(w));

  if (isTurnActive()) {
    // Mid-turn the transcript is streaming into the scroll region and the cursor
    // belongs to it, not to the input frame. Parking at the typing caret here
    // would land the next streamed byte inside the frame. Save/restore around
    // the whole write instead — the same discipline `composeFooterOutput` uses
    // to survive concurrent output. Reached from the 1 s footer timer and the
    // tool-approval restore as well as from `drawBottomUI`.
    output = saveCursorSequence() + output + restoreCursorSequence();
  } else {
    // Park cursor at the typing position.
    const { visualRow, visualCol } = cursorToVisualPos(getInputBuffer(), getCursorPos(), w);
    output += moveToSequence(topBarRow + 1 + visualRow, 3 + visualCol);
  }

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
    if (!footerActive) return;
    // While suspended (raw picker or tool-approval prompt open) the footer is
    // managed manually and something else may own the footer rows — e.g. the
    // approval hint draws on the last row. Writing the composed footer here would
    // clobber it, so emit nothing until resumed.
    if (footerTimerSuspended) return;
    const prevFooterRowCount = footerRowCount;
    const output = composeFooterOutput();
    // Skip the write when the footer is byte-identical to what is already on screen.
    // When idle (no retry banner / quota / spend), the footer text is static, so this
    // makes an idle prompt emit no periodic output — otherwise every tick would write
    // (even with save/restore cursor) and terminals like Termux snap the viewport back
    // to the bottom, fighting the user scrolling up to read scrollback.
    if (!output || output === lastFooterOutput) return;
    lastFooterOutput = output;
    process.stdout.write(output);
    // Only redraw the input area if the footer row count changed (affects reserved rows).
    // Unconditional redraws park the cursor at the bottom, causing Termux to snap the viewport.
    if (inputUIActive && footerRowCount !== prevFooterRowCount) drawInputArea();
  }, 1000);
  // DECSTBM homes the cursor to (1,1), which would put the next console.log on top
  // of whatever already painted (the startup banner). Save/restore around it so the
  // cursor stays where the last output left it.
  process.stdout.write(
    saveCursorSequence() + setScrollRegionSequence(1, rows() - 2) + restoreCursorSequence(),
  );
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
  const reserved = reservedRows();
  const frameRows = reserved - footerRowCount;
  // Open the input frame's rows from wherever the last output left the cursor.
  // Newlines only scroll once the cursor reaches the bottom of the scroll region, so
  // output already filling the region scrolls up by exactly that many (nothing is
  // overwritten), while a short screen (the startup banner) just moves the cursor
  // down and stays put. Four rows rather than three when the `thinking…` label is
  // showing — this runs mid-turn when the tool-approval prompt restores the bar.
  // writeChrome because these newlines are layout, not transcript.
  writeChrome('\r' + '\n'.repeat(frameRows));
  setScrollRegion(1, r - reserved);
  lastReservedRows = reserved;
  // Repaint the footer so the toggle bar (a footer row) appears together with the input
  // bar instead of lagging in on the next timer tick.
  drawFooter();
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
  let output = composeOverlayRestore(w);
  for (let i = 0; i < toClearRows; i++) {
    output += moveToSequence(r - footerRowCount - toClearRows + 1 + i, 1) + clearLineSequence();
  }
  setScrollRegion(1, r - footerRowCount);
  lastReservedRows = footerRowCount;
  // Repaint the footer in the same write so the toggle bar (a footer row) clears at
  // the same instant as the input bar, rather than lingering until the next timer tick.
  const footerOutput = composeFooterOutput();
  output += footerOutput;
  if (footerOutput) lastFooterOutput = footerOutput;
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
  output += resetScrollRegionSequence();
  output += moveToSequence(r - footerRowCount, 1);
  process.stdout.write(output);
  footerRowCount = 2;
  lastFooterOutput = null;
}

// Clears and redraws the input area after a prompt is submitted.
// The footer rows are left untouched.
export function resetSubmittedInputArea() {
  if (!inputUIActive) return;
  const r = rows();
  const w = cols();
  const reserved = reservedRows();
  const prevReserved = lastReservedRows;
  let output = composeOverlayRestore(w);
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

let _resizeDebounce: ReturnType<typeof setTimeout> | null = null;
let _onResizeCallback: (() => void) | null = null;

/** Register a callback to run after each resize redraw (e.g. a raw picker that needs to repaint). Pass null to unregister. */
export function setOnResizeCallback(cb: (() => void) | null): void {
  _onResizeCallback = cb;
}

process.stdout.on('resize', () => {
  if (!footerActive) return;
  if (_resizeDebounce) clearTimeout(_resizeDebounce);
  _resizeDebounce = setTimeout(() => {
    _resizeDebounce = null;

    // Invalidate stale overlay state — all absolute row positions changed.
    resetOverlay();

    // Force the footer repaint below rather than let the cached-output skip suppress it.
    lastFooterOutput = null;

    // Reset geometry so drawFooter/drawInputArea recompute from new dimensions.
    footerRowCount = 2;
    const reserved = reservedRows();
    lastReservedRows = reserved;

    // Two cases, driven by whether any transcript has been printed:
    //  - Fresh/startup (no transcript yet): the banner is what's showing. Wipe and
    //    redraw it at the new width — clean and responsive (compact/full switch),
    //    with no stale bottom-bar cells left to reflow into duplicates.
    //  - A transcript is showing: do NOT wipe to the banner. Reset the scroll
    //    region to full so the footer repositions from the new geometry, then
    //    repaint the transcript from the buffer (below) so it re-lays-out cleanly
    //    at the new width. A pinned menu (callback) owns the whole screen and
    //    repaints itself instead.
    const showingTranscript = hasPostEpochContent() || _onResizeCallback !== null;
    if (!showingTranscript) {
      clearAndRedrawBanner();
      setScrollRegion(1, rows() - reserved);
      drawBottomUI();
      return;
    }

    resetScrollRegion();
    setScrollRegion(1, rows() - reserved);

    // The terminal's own SIGWINCH reflow leaves stale duplicate rows in the scroll
    // region: the cursor-addressed input frame (and any suggestion overlay) reflow
    // in as wrapped ghost copies of the old bottom UI. Neither is in the buffer, so
    // clearing the scroll region and repainting it from the clean transcript buffer
    // (wrapped to the new width) erases the ghosts without truncating transcript
    // lines. Skipped when a pinned menu owns the screen: its callback repaints all.
    if (_onResizeCallback === null) {
      process.stdout.write(composeScrollRegionScrub(rows() - reserved, cols()));
    }

    drawBottomUI();

    // Let an active pinned picker (e.g. list menu) repaint itself on top.
    _onResizeCallback?.();
  }, 32);
});

process.on('exit', () => {
  if (footerActive || inputUIActive) {
    resetScrollRegion();
    moveTo(rows(), 1);
  }
});
