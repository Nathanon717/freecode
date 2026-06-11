import { readFileSync } from "fs";
import type { Interface } from "readline";
import chalk from "chalk";
import { runConfigCommand } from "../commands/config.js";
import { runModelCommand } from "../commands/model.js";
import { redrawBanner } from "./banner.js";
import type {
  ToolCallConfirmation,
  ToolCallPreview,
} from "../agent/tools/index.js";
import { loadConfig } from "../config/index.js";
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
  insertAtCursor,
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
  setQuotaSnapshot,
  setSuggestions,
  setTokenCount,
  setupBottomUI,
  setupInputUI,
  teardownBottomUI,
  teardownFooterUI,
} from "./terminal-ui.js";
import { refreshOpenAIDailySpend } from "./openai-daily-spend.js";
import { loadCachedQuota, saveQuotaToCache } from "../providers/quota/cache.js";
import { cycleByChar, setCtrlHint, getAskMode, initAskMode, isReadOnly } from "./toggles.js";
import {
  askContinueAfterLimit,
  askQuestion,
  confirmToolCallInteractive,
  formatScriptedToolMenu,
  parseScriptedToolChoice,
} from "./tool-approval.js";

function resetBottomPromptState(session: SessionController): void {
  setTokenCount(session.getContextTokenCount());
  setInputBuffer("");
  setInlineCompletion(null);
  setSuggestions(getFilteredCommands(""));
}

let _lastAppliedModel = "";
let _ctrlHintTimer: ReturnType<typeof setTimeout> | null = null;

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
  setSuggestions(getFilteredCommands(""));
  refreshFooterDailySpend(getSelectedModel);
  setupInputUI();
  drawBottomUI();

  return new Promise<string>((resolve) => {
    rl.pause();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedListeners = process.stdin.rawListeners("data") as ((...args: any[]) => void)[];
    process.stdin.removeAllListeners("data");
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function refresh() {
      const input = getInputBuffer();
      setInlineCompletion(getCommandCompletion(input));
      setSuggestions(getFilteredCommands(input));
      drawBottomUI();
    }

    function completedInput(): string {
      return getCommandCompletion(getInputBuffer()) ?? getInputBuffer();
    }

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
          setCtrlHint(true);
          drawBottomUI();
          // Fallback: clear after 5s in case no other key clears it.
          if (_ctrlHintTimer) clearTimeout(_ctrlHintTimer);
          _ctrlHintTimer = setTimeout(() => {
            _ctrlHintTimer = null;
            setCtrlHint(false);
            drawBottomUI();
          }, 5000);
          return;
        }
      }

      // Any non-toggle keypress clears the ctrl hint immediately.
      if (_ctrlHintTimer !== null) {
        clearTimeout(_ctrlHintTimer);
        _ctrlHintTimer = null;
        setCtrlHint(false);
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

  const READ_ONLY_TOOLS = new Set(["create", "edit", "shell_exec"]);

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
