import type { Interface } from "readline";
import chalk from "chalk";
import { getBannerColor } from "./banner.js";
import { filterArgs, formatArgs } from "./transcript-renderer.js";
import type {
  ToolCallConfirmation,
  ToolCallPreview,
} from "../agent/tools/index.js";
import { UserAbortError } from "../util/errors.js";
import {
  getLastReservedRows,
  getRows,
  isBottomUIActive,
  isFooterUIActive,
  setupBottomUI,
  setupInputUI,
  teardownBottomUI,
} from "./terminal-ui.js";

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
// headerRow = r - reserved - 2, approveRow = r - reserved - 1, denyRow = r - reserved.
// Parks the cursor at the selected row so it doesn't drift into the footer.
function drawToolApprovalMenuAbsolute(
  selected: ToolApprovalChoice,
  r: number,
  reserved: number,
  header?: string,
): void {
  const approve =
    selected === "approve" ? chalk.inverse("> Approve") : "  Approve";
  const deny = selected === "deny" ? chalk.inverse("> Deny") : "  Deny";
  const w = process.stdout.columns || 80;
  const headerText = header ? getBannerColor()(header.slice(0, w - 1)) : "";
  const cursorRow = selected === "approve" ? r - reserved - 1 : r - reserved;
  process.stdout.write(
    `\x1b[${r - reserved - 2};1H\x1b[2K${headerText}` +
      `\x1b[${r - reserved - 1};1H\x1b[2K${approve}` +
      `\x1b[${r - reserved};1H\x1b[2K${deny}` +
      `\x1b[${cursorRow};1H`,
  );
}

async function readToolApprovalMenu(
  rl: Interface,
  header?: string,
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
    drawToolApprovalMenuAbsolute(selected, r, reserved, header);
  } else {
    drawToolApprovalMenu(selected);
  }

  return new Promise<ToolApprovalChoice | null>((resolve) => {
    rl.pause();

    // Remove readline's stdin listeners to prevent history-recall side-effects while in raw mode.
     
    const savedListeners = process.stdin.rawListeners("data") as ((
      ...args: unknown[]
    ) => void)[];
    process.stdin.removeAllListeners("data");

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function redraw() {
      if (useAbsolute) {
        drawToolApprovalMenuAbsolute(
          selected,
          getRows(),
          getLastReservedRows(),
          header,
        );
      } else {
        process.stdout.write("\r\x1b[1A");
        drawToolApprovalMenu(selected);
      }
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      // Restore readline's listeners.
      for (const listener of savedListeners) {
        process.stdin.on("data", listener);
      }
    }

    function finish(choice: ToolApprovalChoice | null) {
      cleanup();
      resolve(choice);
    }

    function onData(data: string) {
      if (data === "\x03") {
        cleanup();
        process.exit(0);
      }

      if (data === "\r" || data === "\n") {
        process.stdout.write("\n");
        finish(selected);
        return;
      }

      if (data === "\x1b") {
        process.stdout.write("\n");
        finish(null);
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
    }

    process.stdin.on("data", onData);
  });
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

  return new Promise<string | null>((resolve) => {
    process.stdout.write(prompt);
    let buffer = "";

     
    const savedListeners = process.stdin.rawListeners("data") as ((
      ...args: unknown[]
    ) => void)[];
    process.stdin.removeAllListeners("data");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function cleanup() {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      for (const listener of savedListeners) {
        process.stdin.on("data", listener);
      }
    }

    function onData(data: string) {
      if (data === "\x03") {
        cleanup();
        process.exit(0);
      }

      if (data === "\r" || data === "\n") {
        process.stdout.write("\n");
        cleanup();
        resolve(buffer);
        return;
      }

      if (data === "\x1b") {
        process.stdout.write("\n");
        cleanup();
        resolve(null);
        return;
      }

      if (data.startsWith("\x1b[") || data.startsWith("\x1bO")) return;

      if (data === "\x7f" || data === "\x08") {
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
    }

    process.stdin.on("data", onData);
  });
}

export async function confirmToolCallInteractive(
  rl: Interface,
  preview: ToolCallPreview,
): Promise<ToolCallConfirmation> {
  const restoreInputUI = isBottomUIActive();
  teardownBottomUI();

  const header = `${preview.name}(${formatArgs(filterArgs(preview.name, preview.args))})`;

  try {
    while (true) {
      const choice = await readToolApprovalMenu(rl, header);
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
    // Clear the 3 absolute rows (header, approve, deny) drawn by drawToolApprovalMenuAbsolute
    // before any scroll that would move them out of reach.
    if (isFooterUIActive()) {
      const r = getRows();
      const reserved = getLastReservedRows();
      process.stdout.write(
        `\x1b[${r - reserved - 2};1H\x1b[2K` +
          `\x1b[${r - reserved - 1};1H\x1b[2K` +
          `\x1b[${r - reserved};1H\x1b[2K`,
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
