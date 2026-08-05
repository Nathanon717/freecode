import type { Interface } from "readline";
import chalk from "chalk";
import type {
  ToolCallConfirmation,
  ToolCallPreview,
} from "../../agent/tools/index.js";
import type { ToolCallHeaderRows } from "../render/transcript-renderer.js";
import type { TokenCount } from "../../tokenizers/count.js";
import {
  drawFooter,
  getLastReservedRows,
  getRows,
  isBottomUIActive,
  isFooterUIActive,
  parkCursorInScrollRegion,
  resumeFooterTimer,
  setupInputUI,
  suspendFooterTimer,
  teardownBottomUI,
} from "../chrome/bottom-ui.js";
import { runRawKeySession } from "../menus/raw-picker.js";

export type ToolApprovalChoice = "approve" | "deny";

// Rows this module reserves below a pending-approval preview so the header the
// user is approving stays on screen once the hint draws. Deliberately kept at 3
// (matching the historical footer-plus-hint layout) even though the hint now
// draws on the terminal's last row instead: it is over-conservative, not wrong,
// and the header never scrolls off.
const APPROVAL_MENU_ROWS = 3;

// Preview rows to keep even when the preamble is too tall to fit alongside them.
// A 1-line preview tells the user nothing, so past this point stop yielding ground
// to the preamble and let it scroll instead.
const MIN_PREVIEW_ROWS = 3;

/**
 * Rows a pending-approval preview may occupy and still leave the content above it
 * on screen once this hint draws. The preview flows into the current scroll region
 * directly under the header, so anything past this budget scrolls the header — and
 * the call the user is approving — out of view; the caller truncates the preview
 * instead. Returns null when no footer UI is active: those runs draw no hint and
 * want the full preview.
 *
 * The header is non-negotiable, the preamble is best-effort: a preamble longer than
 * the screen can never be held, and shrinking the preview to nothing chasing it
 * helps no one.
 */
export function getApprovalPreviewRowBudget(
  rowsAbove: ToolCallHeaderRows,
): number | null {
  if (!isFooterUIActive()) return null;
  const scrollHeight = getRows() - getLastReservedRows();
  const forHeader = scrollHeight - rowsAbove.header - APPROVAL_MENU_ROWS;
  const forPreamble = forHeader - rowsAbove.preamble;
  return Math.max(1, Math.min(forHeader, Math.max(MIN_PREVIEW_ROWS, forPreamble)));
}

export function askQuestion(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

// Leading "+N tokens" (or "+N tokens appx" on the estimate path) telling the
// user how much approving this call adds to the model's context. Empty when the
// caller has no count (non-precomputed tools).
function formatTokenPrefix(tokenCount?: TokenCount): string {
  if (!tokenCount) return "";
  const suffix = tokenCount.exact ? "" : " appx";
  return chalk.dim(`+${tokenCount.tokens.toLocaleString()} tokens${suffix} · `);
}

function formatToolApprovalHint(tokenCount?: TokenCount): string {
  return formatTokenPrefix(tokenCount) + chalk.dim("Enter to confirm · Esc to deny");
}

function drawToolApprovalHint(tokenCount?: TokenCount): void {
  process.stdout.write(`\r\x1b[2K${formatToolApprovalHint(tokenCount)}`);
}

// Blanks the pinned footer rows and draws the hint on the terminal's literal
// last row, so during the prompt the hint owns the bottom of the screen with no
// footer beneath it. No header row here — the tool call header is already flowed
// into the transcript just above; redrawing it would only duplicate it. The
// scroll region is left untouched (still reserving these rows); drawFooter in the
// finally repaints the footer. Parks the cursor on the hint row so it doesn't
// drift elsewhere.
function drawToolApprovalHintAbsolute(
  lastRow: number,
  footerRows: number,
  tokenCount?: TokenCount,
): void {
  let out = "";
  for (let r = lastRow - footerRows + 1; r < lastRow; r++) {
    out += `\x1b[${r};1H\x1b[2K`;
  }
  out += `\x1b[${lastRow};1H\x1b[2K${formatToolApprovalHint(tokenCount)}` + `\x1b[${lastRow};1H`;
  process.stdout.write(out);
}

async function readToolApprovalMenu(
  rl: Interface,
  useAbsoluteHint: boolean,
  getTokenCount?: () => TokenCount,
): Promise<ToolApprovalChoice | null> {
  if (!process.stdin.isTTY) {
    rl.resume();
    while (true) {
      const answer = (
        await askQuestion(
          rl,
          chalk.yellow("Approve this tool call? [approve/deny] "),
        )
      )
        .trim()
        .toLowerCase();
      if (
        answer === "" ||
        answer === "approve" ||
        answer === "a" ||
        answer === "y" ||
        answer === "yes"
      )
        return "approve";
      if (
        answer === "deny" ||
        answer === "d" ||
        answer === "n" ||
        answer === "no"
      )
        return "deny";
      console.log(chalk.dim("Please answer approve or deny."));
    }
  }

  const paintHint = (tc?: TokenCount): void => {
    if (useAbsoluteHint) {
      drawToolApprovalHintAbsolute(getRows(), getLastReservedRows(), tc);
    } else {
      drawToolApprovalHint(tc);
    }
  };

  if (useAbsoluteHint) {
    // Freeze the footer refresh timer so its 1 s tick can't repaint the footer
    // rows we are about to blank (quota/spend/retry updates would otherwise
    // clobber the hint on the last row). Resumed in the caller's finally.
    suspendFooterTimer();
  }
  // Draw the confirm controls immediately, then fill in the "+N tokens" prefix
  // once the count is computed. The first count compiles the tokenizer (a
  // one-time ~1 s cost); deferring it to a timer keeps that compile off the
  // initial paint, so the controls always appear at once and the token figure
  // pops in a moment later rather than stalling the whole hint. The compile
  // blocks the loop while it runs, but the hint is already on screen and any
  // keypress queued during it is handled right after — no lost input.
  paintHint();
  const tokenTimer = getTokenCount
    ? setTimeout(() => {
        try {
          paintHint(getTokenCount());
        } catch {
          // countTextTokens never throws; keep the plain hint if it somehow does.
        }
      }, 0)
    : undefined;

  rl.pause();

  // Enter confirms; Escape denies. Escape resolves null, which the caller turns
  // into a denial plus a stop signal (see confirmToolCallInteractive) rather than
  // unwinding the turn outright — the denial and everything the turn already did
  // still commit, the model just isn't called again. Every other key is ignored — there
  // is no selection to move. No newline is written on settle: that would scroll
  // the absolute hint (drawn on the terminal's bottom row) up into the
  // transcript before the finally block can erase it. The finally clear does the
  // erasing so the controls line never persists past the decision.
  // Move the cursor off the bottom row before the raw session returns to cooked
  // mode. On Windows, conpty echoes the buffered Enter CR as \r\n when raw mode
  // is released; if the cursor is still parked on the hint row (where
  // drawToolApprovalHintAbsolute left it) that newline scrolls the hint up one
  // row, so the finally block's clear lands on the wrong row and the controls
  // line survives. Parking at the top makes the echoed newline scroll nothing.
  // Inert on Linux (no CR echo) and on the inline path.
  const parkOffMargin = (): void => {
    if (useAbsoluteHint) process.stdout.write("\x1b[1;1H");
  };

  const session = runRawKeySession<ToolApprovalChoice | null>({
    onKey(data) {
      if (data === "\r" || data === "\n") {
        parkOffMargin();
        session.close("approve");
        return;
      }

      if (data === "\x1b") {
        parkOffMargin();
        session.close(null);
      }
    },
    onCtrlC() {
      process.stdin.pause();
      process.exit(0);
    },
    onClose() {
      process.stdin.pause();
    },
  });

  const choice = await session.promise;
  // Cancel any pending deferred repaint before returning: on type-ahead the key
  // can settle the prompt before the token-count timer fires, and a repaint
  // after the caller's finally cleared the hint would leave a stale controls
  // line (and, on the footer path, re-blank the just-repainted footer). The
  // await resolves in a microtask, before the next timers phase, so this clear
  // always wins the race.
  if (tokenTimer !== undefined) clearTimeout(tokenTimer);
  return choice;
}

export async function confirmToolCallInteractive(
  rl: Interface,
  _preview: ToolCallPreview,
  getTokenCount?: () => TokenCount,
): Promise<ToolCallConfirmation> {
  const restoreInputUI = isBottomUIActive();
  // Footer runs blank the footer rows (keeping the scroll region pinned) so the
  // hint owns the terminal's literal last row with no status bar beneath it; the
  // footer is repainted in the finally. Tearing the input UI down first frees
  // those reserved rows so the footer sits on its own 2 rows.
  const useAbsoluteHint = isFooterUIActive();
  teardownBottomUI();

  try {
    const choice = await readToolApprovalMenu(rl, useAbsoluteHint, getTokenCount);
    // Escape (TTY) resolves null: deny this call like a normal denial — the same
    // "Tool call denied by user: …" result, and the step drains and commits like
    // any other — plus `stopTurn`, which ends the turn there instead of letting
    // the model answer the denial. The conversation resumes on the user's next
    // message. See agent/tools/index.ts `withTurnStop`.
    if (choice === null) return { approved: false, stopTurn: true };
    return { approved: choice === "approve" };
  } finally {
    rl.pause();
    // Erase the confirm hint so it never persists in the transcript past the
    // decision. Footer runs draw it absolute on the terminal's last row: resume
    // the timer, repaint the footer (which clears the blanked rows and the hint),
    // and re-park the cursor. Inline runs leave the cursor parked on the hint
    // line, so a carriage-return + clear-line wipes it in place.
    if (useAbsoluteHint) {
      process.stdout.write(`\x1b[${getRows()};1H\x1b[2K`);
      resumeFooterTimer();
      drawFooter();
      // When the input UI was also up, restoring it parks the cursor at the typing
      // position; otherwise (mid-agent-turn) park at the scroll region's bottom so
      // continued transcript output flows from there rather than over the footer.
      if (restoreInputUI) {
        setupInputUI();
      } else {
        parkCursorInScrollRegion();
      }
    } else if (process.stdin.isTTY) {
      process.stdout.write("\r\x1b[2K");
      if (restoreInputUI) setupInputUI();
    }
  }
}

export function formatScriptedToolMenu(choice: ToolApprovalChoice): void {
  console.log(choice === "approve" ? chalk.inverse("> Approve") : "  Approve");
  console.log(choice === "deny" ? chalk.inverse("> Deny") : "  Deny");
}

export function parseScriptedToolChoice(
  input: string | undefined,
): ToolApprovalChoice | null {
  const normalized = input?.trim().toLowerCase();
  if (
    normalized === "y" ||
    normalized === "yes" ||
    normalized === "approve" ||
    normalized === "a"
  ) {
    return "approve";
  }
  if (
    normalized === "n" ||
    normalized === "no" ||
    normalized === "deny" ||
    normalized === "d"
  ) {
    return "deny";
  }
  return null;
}
