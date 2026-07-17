import type { Interface } from "readline";
import chalk from "chalk";
import type {
  ToolCallConfirmation,
  ToolCallPreview,
} from "../agent/tools/index.js";
import type { ToolCallHeaderRows } from "./transcript-renderer.js";
import { UserAbortError } from "../util/errors.js";
import {
  getLastReservedRows,
  getRows,
  isBottomUIActive,
  isFooterUIActive,
  setupInputUI,
  teardownBottomUI,
} from "./bottom-ui.js";
import { runRawKeySession } from "./raw-picker.js";

export type ToolApprovalChoice = "approve" | "deny";

// Rows this module claims below a pending-approval preview: the two blank lines
// confirmToolCallInteractive pads for clearance, plus the single hint row
// drawToolApprovalHintAbsolute then draws. Keep in step with those two.
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

function formatToolApprovalHint(): string {
  return chalk.dim("Enter to confirm · Esc to deny");
}

function drawToolApprovalHint(): void {
  process.stdout.write(`\r\x1b[2K${formatToolApprovalHint()}`);
}

// Draws the hint at an absolute terminal row, above the pinned footer. No header
// row here — the tool call header is already flowed into the transcript just
// above; redrawing it would only duplicate it. Parks the cursor on the hint row
// so it doesn't drift into the footer.
function drawToolApprovalHintAbsolute(r: number, reserved: number): void {
  const row = r - reserved;
  process.stdout.write(
    `\x1b[${row};1H\x1b[2K${formatToolApprovalHint()}` + `\x1b[${row};1H`,
  );
}

async function readToolApprovalMenu(
  rl: Interface,
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

  if (isFooterUIActive()) {
    drawToolApprovalHintAbsolute(getRows(), getLastReservedRows());
  } else {
    drawToolApprovalHint();
  }

  rl.pause();

  // Enter confirms; Escape denies. Escape resolves null, which the caller turns
  // into a UserAbortError so the turn unwinds and the user lands back at the
  // input bar to say what they wanted instead. Every other key is ignored — there
  // is no selection to move. No newline is written on settle: that would scroll
  // the absolute hint (drawn on the scroll region's bottom margin) up into the
  // transcript before the finally block can erase it. The finally clear does the
  // erasing so the controls line never persists past the decision.
  const session = runRawKeySession<ToolApprovalChoice | null>({
    onKey(data) {
      if (data === "\r" || data === "\n") {
        session.close("approve");
        return;
      }

      if (data === "\x1b") {
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

  return session.promise;
}

export async function confirmToolCallInteractive(
  rl: Interface,
  preview: ToolCallPreview,
): Promise<ToolCallConfirmation> {
  const restoreInputUI = isBottomUIActive();
  teardownBottomUI();

  // The absolute-positioned hint below draws at a fixed row near the bottom of the
  // terminal (see drawToolApprovalHintAbsolute). That row is only guaranteed to be
  // blank when nothing has been written since the header — but agent/tools/index.ts
  // flows a read-only content preview right after the header for some tools, and once
  // the scroll region fills, that preview's tail lands exactly on the hint's fixed
  // row and gets silently overwritten. Pad blank lines to push it clear first
  // (confirmed via a live PTY probe — this is not a hypothetical edge case).
  if (preview.previewedContent && isFooterUIActive()) {
    process.stdout.write("\n\n");
  }

  try {
    const choice = await readToolApprovalMenu(rl);
    // Escape (TTY) resolves null: unwind the turn so the user is returned to the
    // input bar to redirect the agent there, rather than through a bespoke prompt.
    if (choice === null) throw new UserAbortError();
    return { approved: choice === "approve" };
  } finally {
    rl.pause();
    // Erase the confirm hint so it never persists in the transcript past the
    // decision. Footer runs draw it absolute on the scroll region's bottom margin,
    // so clear that exact row; inline runs leave the cursor parked on the hint line,
    // so a carriage-return + clear-line wipes it in place.
    if (isFooterUIActive()) {
      process.stdout.write(`\x1b[${getRows() - getLastReservedRows()};1H\x1b[2K`);
    } else if (process.stdin.isTTY) {
      process.stdout.write("\r\x1b[2K");
    }
    if (restoreInputUI && process.stdin.isTTY) setupInputUI();
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
