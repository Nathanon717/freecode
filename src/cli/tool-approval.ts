import type { Interface } from "readline";
import chalk from "chalk";
import type {
  ToolCallConfirmation,
  ToolCallPreview,
} from "../agent/tools/index.js";
import { UserAbortError } from "../util/errors.js";
import { isBackspaceKey } from "../util/keys.js";
import {
  getLastReservedRows,
  getRows,
  isBottomUIActive,
  isFooterUIActive,
  setupBottomUI,
  setupInputUI,
  teardownBottomUI,
} from "./terminal-ui.js";
import { runRawKeySession } from "./raw-picker.js";

export type ToolApprovalChoice = "approve" | "deny";

export function askQuestion(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function drawToolApprovalMenu(selected: ToolApprovalChoice): void {
  const approve =
    selected === "approve" ? chalk.inverse("> Approve") : "  Approve";
  const deny = selected === "deny" ? chalk.inverse("> Deny") : "  Deny";
  process.stdout.write(`\r\x1b[2K${approve}\n\r\x1b[2K${deny}`);
}

// Draws the tool menu options at absolute terminal rows, above the pinned footer.
// approveRow = r - reserved - 1, denyRow = r - reserved. No header row here — the
// tool call header is already flowed into the transcript just above; redrawing it
// would only duplicate it.
// Parks the cursor at the selected row so it doesn't drift into the footer.
function drawToolApprovalMenuAbsolute(
  selected: ToolApprovalChoice,
  r: number,
  reserved: number,
): void {
  const approve =
    selected === "approve" ? chalk.inverse("> Approve") : "  Approve";
  const deny = selected === "deny" ? chalk.inverse("> Deny") : "  Deny";
  const cursorRow = selected === "approve" ? r - reserved - 1 : r - reserved;
  process.stdout.write(
    `\x1b[${r - reserved - 1};1H\x1b[2K${approve}` +
      `\x1b[${r - reserved};1H\x1b[2K${deny}` +
      `\x1b[${cursorRow};1H`,
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

  let selected: ToolApprovalChoice = "approve";

  const useAbsolute = isFooterUIActive();
  if (useAbsolute) {
    const r = getRows();
    const reserved = getLastReservedRows();
    drawToolApprovalMenuAbsolute(selected, r, reserved);
  } else {
    drawToolApprovalMenu(selected);
  }

  rl.pause();

  function redraw() {
    if (useAbsolute) {
      drawToolApprovalMenuAbsolute(selected, getRows(), getLastReservedRows());
    } else {
      process.stdout.write("\r\x1b[1A");
      drawToolApprovalMenu(selected);
    }
  }

  const session = runRawKeySession<ToolApprovalChoice | null>({
    onKey(data) {
      if (data === "\r" || data === "\n") {
        process.stdout.write("\n");
        session.close(selected);
        return;
      }

      if (data === "\x1b") {
        process.stdout.write("\n");
        session.close(null);
        return;
      }

      if (data === "\x1b[B" || data === "j") {
        selected = "deny";
        redraw();
        return;
      }

      if (data === "\x1b[A" || data === "k") {
        selected = "approve";
        redraw();
        return;
      }

      if (data.toLowerCase() === "a") {
        selected = "approve";
        redraw();
        return;
      }

      if (data.toLowerCase() === "d") {
        selected = "deny";
        redraw();
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

function askQuestionOrEscape(
  rl: Interface,
  prompt: string,
): Promise<string | null> {
  if (!process.stdin.isTTY) {
    return new Promise<string | null>((resolve) => {
      rl.resume();
      rl.question(prompt, (answer) => resolve(answer.trim()));
    });
  }

  process.stdout.write(prompt);
  let buffer = "";

  const session = runRawKeySession<string | null>({
    onKey(data) {
      if (data === "\r" || data === "\n") {
        process.stdout.write("\n");
        session.close(buffer);
        return;
      }

      if (data === "\x1b") {
        process.stdout.write("\n");
        session.close(null);
        return;
      }

      if (data.startsWith("\x1b[") || data.startsWith("\x1bO")) return;

      if (isBackspaceKey(data)) {
        if (buffer.length > 0) {
          buffer = buffer.slice(0, -1);
          process.stdout.write("\r\x1b[2K" + prompt + buffer);
        }
        return;
      }

      const printable = [...data].filter((c) => c >= " ").join("");
      if (printable) {
        buffer += printable;
        process.stdout.write(printable);
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

  // The absolute-positioned menu below draws at 2 fixed rows near the bottom of the
  // terminal (see drawToolApprovalMenuAbsolute). Those rows are only guaranteed to be
  // blank when nothing has been written since the header — but agent/tools/index.ts
  // flows a read-only content preview right after the header for some tools, and once
  // the scroll region fills, that preview's tail lands exactly on the menu's fixed
  // rows and gets silently overwritten. Pad blank lines to push it clear first
  // (confirmed via a live PTY probe — this is not a hypothetical edge case).
  if (preview.previewedContent && isFooterUIActive()) {
    process.stdout.write("\n\n");
  }

  try {
    while (true) {
      const choice = await readToolApprovalMenu(rl);
      if (choice === null) throw new UserAbortError();
      if (choice === "approve") return { approved: true };

      const message = await askQuestionOrEscape(
        rl,
        chalk.yellow("Tell the agent what to do instead: "),
      );
      if (message === null) throw new UserAbortError();

      return { approved: false, message };
    }
  } finally {
    rl.pause();
    // Clear the 2 absolute rows (approve, deny) drawn by drawToolApprovalMenuAbsolute
    // before any scroll that would move them out of reach.
    if (isFooterUIActive()) {
      const r = getRows();
      const reserved = getLastReservedRows();
      process.stdout.write(
        `\x1b[${r - reserved - 1};1H\x1b[2K` + `\x1b[${r - reserved};1H\x1b[2K`,
      );
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

export async function askContinueAfterLimit(
  rl: Interface,
  count: number,
): Promise<boolean> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();
  try {
    const answer = await askQuestion(
      rl,
      chalk.yellow(`\n${count} tool calls used this turn. Continue? [Y/n] `),
    );
    return answer.trim().toLowerCase() !== "n";
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) setupBottomUI();
  }
}
