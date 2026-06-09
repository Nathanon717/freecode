import { readFileSync } from "fs";
import type { Interface } from "readline";
import chalk from "chalk";
import { runConfigCommand } from "../commands/config.js";
import { runModelCommand } from "../commands/model.js";
import { getBannerColor, redrawBanner } from "./banner.js";
import {
  filterArgs,
  formatArgs,
  type ToolCallConfirmation,
  type ToolCallPreview,
} from "../agent/tools/index.js";
import { loadConfig } from "../config/index.js";
import { UserAbortError } from "../util/errors.js";
import { getCommandCompletion, getFilteredCommands } from "./slash-commands.js";
import { runEvalMenu } from "./scenario-menu.js";
import { runHumanEvalMenu } from "../commands/humaneval.js";
import type { SessionController } from "./session-controller.js";
import type { CliSessionMode } from "./session-runner.js";
import {
  backspaceAtCursor,
  deleteAtCursor,
  drawBottomUI,
  getInputBuffer,
  getLastReservedRows,
  getRows,
  insertAtCursor,
  isBottomUIActive,
  isFooterUIActive,
  moveCursorDown,
  moveCursorEnd,
  moveCursorHome,
  moveCursorLeft,
  moveCursorRight,
  moveCursorUp,
  parkCursorAboveBottomUI,
  parkCursorInScrollRegion,
  resetSubmittedInputArea,
  setInputBuffer,
  setInlineCompletion,
  setModelStatus,
  setOpenAIDailySpend,
  setPreflightInputCost,
  setQuotaSnapshot,
  setSuggestions,
  setTokenCount,
  setupBottomUI,
  setupInputUI,
  teardownBottomUI,
  teardownFooterUI,
} from "./terminal-ui.js";
import { createOpenAIPreflightInputController } from "./preflight-input-cost.js";
import { refreshOpenAIDailySpend } from "./openai-daily-spend.js";
import { loadCachedQuota, saveQuotaToCache } from "../providers/quota/cache.js";
import { cycleByChar, getAskMode, initAskMode, isReadOnly } from "./toggles.js";

type ToolApprovalChoice = "approve" | "deny";

function askQuestion(rl: Interface, prompt: string): Promise<string> {
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

function resetBottomPromptState(session: SessionController): void {
  setTokenCount(session.getContextTokenCount());
  setInputBuffer("");
  setInlineCompletion(null);
  setPreflightInputCost({
    state: "idle",
    providerId: "",
    modelId: "",
    updatedAt: Date.now(),
  });
  setSuggestions(getFilteredCommands(""));
}

let _lastAppliedModel = "";

function syncModelLabel(model: string): void {
  const idx = model.indexOf(":");
  if (idx !== -1) setModelStatus(model.slice(0, idx), model.slice(idx + 1));
  else if (model) setModelStatus("", model);
}

// Call when the active model changes. Clears stale quota so the footer shows
// nothing until the new model's API response fills it in.
function applyModelChange(model: string): void {
  if (model === _lastAppliedModel) return;
  _lastAppliedModel = model;
  syncModelLabel(model);
  setQuotaSnapshot(null);
}

function applyModelStatus(model: string): void {
  syncModelLabel(model);
  _lastAppliedModel = model;
  const idx = model.indexOf(":");
  if (idx !== -1) {
    const cached = loadCachedQuota(model.slice(0, idx));
    if (cached) setQuotaSnapshot(cached.snapshot);
  }
}

function refreshFooterDailySpend(getSelectedModel: () => string): void {
  refreshOpenAIDailySpend({
    setOpenAIDailySpend,
    redraw: drawBottomUI,
    modelPreference: getSelectedModel,
  });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedListeners = process.stdin.rawListeners("data") as ((
      ...args: any[]
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedListeners = process.stdin.rawListeners("data") as ((
      ...args: any[]
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

async function confirmToolCallInteractive(
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

function formatScriptedToolMenu(choice: ToolApprovalChoice): void {
  console.log(choice === "approve" ? chalk.inverse("> Approve") : "  Approve");
  console.log(choice === "deny" ? chalk.inverse("> Deny") : "  Deny");
}

function parseScriptedToolChoice(
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

async function readLineWithAutocomplete(
  rl: Interface,
  tokenCount: number,
  session: SessionController,
  getSelectedModel: () => string,
): Promise<string> {
  if (!process.stdin.isTTY) {
    return askQuestion(rl, chalk.green("> "));
  }

  setTokenCount(tokenCount);
  setInputBuffer("");
  setInlineCompletion(null);
  setPreflightInputCost({
    state: "idle",
    providerId: "",
    modelId: "",
    updatedAt: Date.now(),
  });
  setSuggestions(getFilteredCommands(""));
  refreshFooterDailySpend(getSelectedModel);
  setupInputUI();
  drawBottomUI();

  return new Promise<string>((resolve) => {
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function refresh() {
      const input = getInputBuffer();
      setInlineCompletion(getCommandCompletion(input));
      setSuggestions(getFilteredCommands(input));
      preflight.schedule(input);
      drawBottomUI();
    }

    function completedInput(): string {
      return getCommandCompletion(getInputBuffer()) ?? getInputBuffer();
    }

    function cleanup() {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      preflight.stop();
    }

    const preflight = createOpenAIPreflightInputController({
      getMessages: () => session.messages,
      getSelectedModel,
      setPreflightInputCost,
      redraw: drawBottomUI,
    });

    function onData(data: string) {
      if (data === "\x03") {
        cleanup();
        teardownFooterUI();
        process.exit(0);
      }

      // Ctrl+letter (codes \x01-\x1a): check against toggle chars.
      if (
        data.length === 1 &&
        data.charCodeAt(0) >= 1 &&
        data.charCodeAt(0) <= 26
      ) {
        const letter = String.fromCharCode(data.charCodeAt(0) + 64);
        if (cycleByChar(letter)) {
          drawBottomUI();
          return;
        }
      }

      if (data === "\r") {
        const submitted = completedInput();
        setInputBuffer("");
        setInlineCompletion(null);
        setSuggestions([]);
        resetSubmittedInputArea();
        parkCursorInScrollRegion();
        const displayLines = submitted.split('\n');
        const displayText = displayLines
          .map((l, i) => (i === 0 ? chalk.green('> ') : '  ') + l)
          .join('\r\n');
        process.stdout.write(displayText + "\r\n");
        cleanup();
        resolve(submitted);
        return;
      }

      // Ctrl+J: insert a newline for multi-line input.
      if (data === "\n") {
        insertAtCursor('\n');
        refresh();
        return;
      }

      if (data === "\t") {
        const completion = getCommandCompletion(getInputBuffer());
        if (completion) {
          setInputBuffer(completion);
          refresh();
        }
        return;
      }

      if (data === "\x7f" || data === "\x08") {
        if (getInputBuffer().length > 0) {
          backspaceAtCursor();
          refresh();
        }
        return;
      }

      // Cursor movement and editing escape sequences.
      if (data.startsWith("\x1b[") || data.startsWith("\x1bO")) {
        if (data === "\x1b[D" || data === "\x1bOD") { moveCursorLeft(); refresh(); }
        else if (data === "\x1b[C" || data === "\x1bOC") { moveCursorRight(); refresh(); }
        else if (data === "\x1b[A" || data === "\x1bOA") { moveCursorUp(); refresh(); }
        else if (data === "\x1b[B" || data === "\x1bOB") { moveCursorDown(); refresh(); }
        else if (data === "\x1b[H" || data === "\x1bOH" || data === "\x1b[1~") { moveCursorHome(); refresh(); }
        else if (data === "\x1b[F" || data === "\x1bOF" || data === "\x1b[4~") { moveCursorEnd(); refresh(); }
        else if (data === "\x1b[3~") { deleteAtCursor(); refresh(); }
        return;
      }

      if (data === "\x1b") {
        if (getInputBuffer().length > 0) {
          setInputBuffer("");
          refresh();
        }
        return;
      }

      const printable = [...data].filter((c) => c >= " ").join("");
      if (printable) {
        insertAtCursor(printable);
        refresh();
      }
    }

    process.stdin.on("data", onData);
  });
}

const TOOL_CALL_LIMIT = 10;

async function askContinueAfterLimit(
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

export function createInteractiveMode(
  rl: Interface,
  projectRoot: string,
  session: SessionController,
  getSelectedModel: () => string,
  setSelectedModel: (model: string) => void,
): CliSessionMode {
  applyModelStatus(getSelectedModel());
  const config = loadConfig();
  initAskMode(config.toolConfirmation);
  let toolCallsThisTurn = 0;

  const READ_ONLY_TOOLS = new Set(["write_file", "edit_file", "shell_exec"]);

  async function confirmToolCall(
    preview: ToolCallPreview,
  ): Promise<ToolCallConfirmation> {
    toolCallsThisTurn++;
    if (toolCallsThisTurn % TOOL_CALL_LIMIT === 0) {
      const shouldContinue = await askContinueAfterLimit(rl, toolCallsThisTurn);
      if (!shouldContinue)
        return {
          approved: false,
          message: "Stopped by user after tool call limit.",
        };
    }
    // Mid-turn read-only enforcement: deny write tools if Read was toggled on since this turn started.
    if (isReadOnly() && READ_ONLY_TOOLS.has(preview.name)) {
      console.log(chalk.dim(`Read-only mode: denied ${preview.name}`));
      return {
        approved: false,
        message: "Read-only mode is active (Ctrl+R to disable).",
      };
    }
    if (getAskMode() === "auto") {
      return { approved: true };
    }
    return confirmToolCallInteractive(rl, preview);
  }

  return {
    readInput: (tokenCount) =>
      readLineWithAutocomplete(rl, tokenCount, session, getSelectedModel),
    confirmToolCall,
    getReadOnly: isReadOnly,
    modelListMode: "full",
    beforeAgentCall: () => {
      toolCallsThisTurn = 0;
      if (process.stdin.isTTY) teardownBottomUI();
      resetBottomPromptState(session);
    },
    afterAgentCall: () => {
      if (process.stdin.isTTY) {
        setupBottomUI();
        resetBottomPromptState(session);
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }
    },
    beforeScreenClear: () => {
      teardownBottomUI();
    },
    afterScreenClear: () => {
      if (process.stdin.isTTY) setupBottomUI();
    },
    onAgentResult: (result) => {
      setModelStatus(result.providerId, result.modelId);
      setQuotaSnapshot(result.quota);
      if (result.quota && result.providerId) {
        saveQuotaToCache(result.providerId, result.quota);
      }
    },
    beforeDispatch: () => {
      if (process.stdin.isTTY) {
        teardownBottomUI();
        parkCursorAboveBottomUI();
      }
    },
    afterDispatch: () => {
      if (process.stdin.isTTY) {
        applyModelChange(getSelectedModel());
        setupBottomUI();
        resetBottomPromptState(session);
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }
    },
    runConfig: async () => {
      teardownBottomUI();
      rl.resume();
      await runConfigCommand(rl, getSelectedModel());
      rl.pause();
      if (process.stdin.isTTY) {
        redrawBanner();
        setupBottomUI();
        resetBottomPromptState(session);
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }
    },
    runModelMenu: async () => {
      teardownBottomUI();
      rl.resume();
      const pickerShown = await runModelCommand(
        rl,
        getSelectedModel(),
        setSelectedModel,
      );
      rl.pause();
      applyModelChange(getSelectedModel());
      if (process.stdin.isTTY) {
        if (pickerShown) redrawBanner();
        setupBottomUI();
        resetBottomPromptState(session);
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }
    },
    runEvalMenu: () => runEvalMenu(rl, projectRoot, getSelectedModel),
    runHumanEvalMenu: () => runHumanEvalMenu(rl, projectRoot, getSelectedModel),
    onExit: () => {
      teardownFooterUI();
    },
  };
}

export function createScriptedMode(
  scriptPath: string,
  projectRoot: string,
  rl: Interface,
): CliSessionMode {
  const lines = readFileSync(scriptPath, "utf-8")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith('"')) {
        try {
          return JSON.parse(line) as string;
        } catch {}
      }
      return line;
    });
  let lineIdx = 0;

  const autoConfirm = process.env["FREECODE_AUTO_CONFIRM"] === "1";
  const maxToolCalls = parseInt(
    process.env["FREECODE_MAX_TOOL_CALLS"] ?? "10",
    10,
  );
  let autoCallCount = 0;

  return {
    readInput: (): Promise<string | null> => {
      if (lineIdx >= lines.length) return Promise.resolve(null);
      const line = lines[lineIdx++];
      console.log(chalk.green("> ") + line);
      return Promise.resolve(line);
    },
    confirmToolCall: async (_preview) => {
      if (autoConfirm) {
        autoCallCount++;
        if (autoCallCount % maxToolCalls === 0) {
          const shouldContinue = await askContinueAfterLimit(rl, autoCallCount);
          if (!shouldContinue)
            return {
              approved: false,
              message: `Stopped after tool call limit of ${maxToolCalls}.`,
            };
        }
        process.stderr.write(chalk.dim("Auto-approved.\n"));
        return { approved: true };
      }

      const choice = parseScriptedToolChoice(lines[lineIdx]);
      if (choice) {
        const rawChoice = lines[lineIdx]?.trim() ?? "";
        lineIdx++;
        formatScriptedToolMenu(choice);
        console.log(chalk.dim(`Scripted selection: ${rawChoice}`));

        if (choice === "approve") return { approved: true };

        const message = lines[lineIdx] ?? "";
        if (message) {
          lineIdx++;
          console.log(
            chalk.yellow(`Tell the agent what to do instead: ${message}`),
          );
        } else {
          console.log(chalk.yellow("Tell the agent what to do instead:"));
        }
        return { approved: false, message };
      }

      formatScriptedToolMenu("deny");
      console.log(
        chalk.dim("No scripted approval provided; denying tool call."),
      );
      return { approved: false };
    },
    modelListMode: "current-only",
    skipStrayConfirmations: true,
    runEvalMenu: (): Promise<void> => {
      console.log(chalk.dim("/eval is not available in scripted mode."));
      return Promise.resolve();
    },
    onInputExhausted: () => {
      if (!process.env.FREECODE_AUTO_CONFIRM) {
        console.log(chalk.dim("Goodbye!"));
      }
    },
  };
}
