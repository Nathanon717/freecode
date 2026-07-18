import { readFileSync } from "fs";
import type { Interface } from "readline";
import chalk from "chalk";
import { runConfigCommand } from "../commands/config.js";
import { runModelCommand } from "../commands/model.js";
import type {
  ToolCallConfirmation,
  ToolCallPreview,
} from "../agent/tools/index.js";
import { loadConfig, resolveModelSettings } from "../config/index.js";
import { getCommandCompletion, getFilteredCommands } from "./slash-commands.js";
import {
  buildToolCallSkeleton,
  nextToolFieldCaret,
  stripEmptyToolArgs,
  toolFieldBackspace,
  toolNameBeforeCursor,
} from "./tool-invocation.js";
import { runEvalMenu } from "./eval-menu.js";
import { getBannerColor } from "./banner.js";
import type { CliSessionMode } from "./session-runner.js";
import {
  drawBottomUI,
  parkCursorAboveBottomUI,
  parkCursorInScrollRegion,
  resetSubmittedInputArea,
  setInlineCompletion,
  setSuggestions,
  setupBottomUI,
  setupInputUI,
  teardownBottomUI,
  teardownFooterUI,
} from "./bottom-ui.js";
import {
  backspaceAtCursor,
  deleteAtCursor,
  getCursorPos,
  getInputBuffer,
  insertAtCursor,
  moveCursorDown,
  moveCursorEnd,
  moveCursorHome,
  moveCursorLeft,
  moveCursorRight,
  moveCursorUp,
  setCursorPos,
  setInputBuffer,
} from "./input-buffer.js";
import {
  setActiveModel,
  setActiveModelFromString,
  setOpenAIDailySpend,
  setQuotaSnapshot,
} from "./footer-status.js";
import { refreshOpenAIDailySpend } from "../providers/openai-daily-spend.js";
import { loadCachedQuota, saveQuotaToCache } from "../providers/quota/cache.js";
import { cycleByChar, getAskMode, initAskMode, isReadOnly } from "./toggles.js";
import {
  askQuestion,
  confirmToolCallInteractive,
  formatScriptedToolMenu,
  parseScriptedToolChoice,
} from "./tool-approval.js";
import { runRawKeySession } from "./raw-picker.js";
import { isBackspaceKey } from "../util/keyboard.js";
import { countTextTokens, preloadTokenizerFor, type TokenCount } from "../tokenizers/count.js";

function resetBottomPromptState(): void {
  setInputBuffer("");
  setInlineCompletion(null);
  setSuggestions(getFilteredCommands(""));
}

// Inserts printable input, with two editor conveniences for tool calls:
//  - typing `(` right after a valid tool name autofills the full argument
//    skeleton (`read(path="", offset=, limit=)`) with the caret in the first
//    value slot; Tab/Backspace then move between slots (see readLineWith...);
//  - typing `)` when the cursor already sits on a `)` types over it rather than
//    inserting a duplicate (so the autofilled close is skipped naturally).
function handlePrintable(printable: string): void {
  if (printable === "(") {
    const toolName = toolNameBeforeCursor(getInputBuffer(), getCursorPos());
    if (toolName) {
      const { text, caret } = buildToolCallSkeleton(toolName);
      const at = getCursorPos();
      insertAtCursor(text);
      setCursorPos(at + caret);
      return;
    }
  }
  if (printable === ")" && getInputBuffer()[getCursorPos()] === ")") {
    moveCursorRight();
    return;
  }
  insertAtCursor(printable);
}

let _lastAppliedModel = "";

// Compile this model's exact tokenizer in the background so the approval
// preview's "+N tokens" count becomes exact rather than an estimate on later
// calls. Deferred to a timer so the (synchronous, ~1s) compile for a bundled
// family can't stall the initial render. No-op — and no network — for models
// with no exact backend (e.g. the mock model), so it never freezes startup.
function warmTokenizers(model: string): void {
  setTimeout(() => void preloadTokenizerFor(model), 0);
}

// Call when the active model changes. Clears stale quota so the footer shows
// nothing until the new model's API response fills it in.
function applyModelChange(model: string): void {
  if (model === _lastAppliedModel) return;
  _lastAppliedModel = model;
  setActiveModelFromString(model);
  setQuotaSnapshot(null);
  warmTokenizers(model);
}

function applyModelStatus(model: string): void {
  setActiveModelFromString(model);
  _lastAppliedModel = model;
  warmTokenizers(model);
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
  getSelectedModel: () => string,
): Promise<string> {
  if (!process.stdin.isTTY) {
    return askQuestion(rl, "> ");
  }

  setInputBuffer("");
  setInlineCompletion(null);
  setSuggestions(getFilteredCommands(""));
  refreshFooterDailySpend(getSelectedModel);
  setupInputUI();
  drawBottomUI();

  rl.pause();

  function refresh() {
    const input = getInputBuffer();
    setInlineCompletion(getCommandCompletion(input));
    setSuggestions(getFilteredCommands(input));
    drawBottomUI();
  }

  function completedInput(): string {
    return getCommandCompletion(getInputBuffer()) ?? getInputBuffer();
  }

  const rawSession = runRawKeySession<string>({
    onKey(data: string) {
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
        const submitted = stripEmptyToolArgs(completedInput());
        setInputBuffer("");
        setInlineCompletion(null);
        setSuggestions([]);
        resetSubmittedInputArea();
        parkCursorInScrollRegion();
        const displayLines = submitted.split('\n');
        const displayText = displayLines
          .map((l, i) => (i === 0 ? getBannerColor()('> ') : '  ') + l)
          .join('\r\n');
        process.stdout.write(displayText + "\r\n");
        rawSession.close(submitted);
        return;
      }

      // Ctrl+J: insert a newline for multi-line input.
      if (data === "\n") {
        insertAtCursor('\n');
        refresh();
        return;
      }

      if (data === "\t") {
        // Inside a hand-typed tool call, Tab cycles between argument value slots.
        const fieldCaret = nextToolFieldCaret(getInputBuffer(), getCursorPos());
        if (fieldCaret !== null) {
          setCursorPos(fieldCaret);
          refresh();
          return;
        }
        const completion = getCommandCompletion(getInputBuffer());
        if (completion) {
          setInputBuffer(completion);
          refresh();
        }
        return;
      }

      if (isBackspaceKey(data)) {
        // At an emptied tool-call value slot, Backspace steps to the previous
        // slot instead of eating the autofilled `=`/`""` skeleton.
        const back = toolFieldBackspace(getInputBuffer(), getCursorPos());
        if (back === "block") return;
        if (typeof back === "number") {
          setCursorPos(back);
          refresh();
          return;
        }
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
        handlePrintable(printable);
        refresh();
      }
    },
    onCtrlC() {
      process.stdin.pause();
      teardownFooterUI();
      process.exit(0);
    },
    onClose() {
      process.stdin.pause();
    },
  });

  return rawSession.promise;
}

export function createInteractiveMode(
  rl: Interface,
  projectRoot: string,
  getSelectedModel: () => string,
  setSelectedModel: (model: string) => void,
): CliSessionMode {
  applyModelStatus(getSelectedModel());
  const config = loadConfig();
  initAskMode(config.toolConfirmation);

  const READ_ONLY_TOOLS = new Set(["create", "edit", "shell_exec"]);

  // Tools the token budget may auto-approve. Deliberately an explicit allowlist
  // rather than "any tool we can count tokens for": it must never widen just
  // because another tool starts reporting a result size. `create` in particular
  // shows a content preview and could be measured, but writes a file — it is
  // never auto-approved at any budget.
  const BUDGET_APPROVABLE_TOOLS = new Set(["read", "grep", "list_dir"]);

  async function confirmToolCall(
    preview: ToolCallPreview,
  ): Promise<ToolCallConfirmation> {
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
    // For precomputed read-only tools the result is already known, so show how
    // many tokens approving will add to the model's context (exact when this
    // model's tokenizer is loaded, otherwise a labelled estimate). Passed as a
    // thunk, not a value: the first count compiles the tokenizer (~1s), which
    // the approval UI defers so the confirm controls still appear instantly.
    const resultText = preview.resultText;
    const getTokenCount =
      resultText !== undefined
        ? (): TokenCount => countTextTokens(resultText, getSelectedModel())
        : undefined;

    // Auto-approve cheap read-only calls. The comparison uses the very same
    // count the hint would have displayed (exact encoder when loaded, labelled
    // fallback estimate otherwise), so what the user configured against is what
    // the user would have seen. A budget of 0 is off.
    const budget = resolveModelSettings(getSelectedModel()).autoApproveTokenBudget;
    if (budget > 0 && getTokenCount && BUDGET_APPROVABLE_TOOLS.has(preview.name)) {
      if (getTokenCount().tokens < budget) return { approved: true };
    }

    return confirmToolCallInteractive(rl, preview, getTokenCount);
  }

  return {
    readInput: () =>
      readLineWithAutocomplete(rl, getSelectedModel),
    confirmToolCall,
    getReadOnly: isReadOnly,
    modelListMode: "full",
    beforeAgentCall: () => {
      if (process.stdin.isTTY) teardownBottomUI();
      resetBottomPromptState();
    },
    afterAgentCall: () => {
      if (process.stdin.isTTY) {
        setupBottomUI();
        resetBottomPromptState();
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
      setActiveModel(result.providerId, result.modelId);
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
        resetBottomPromptState();
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }
    },
    runConfig: () =>
      runConfigCommand(rl, getSelectedModel(), () => {
        resetBottomPromptState();
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }),
    runModelMenu: () =>
      runModelCommand(rl, getSelectedModel(), setSelectedModel, () => {
        applyModelChange(getSelectedModel());
        resetBottomPromptState();
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }).then(() => undefined),
    runEvalMenu: () => runEvalMenu(rl, projectRoot, getSelectedModel),
    onExit: () => {
      teardownFooterUI();
    },
  };
}

export function createScriptedMode(scriptPath: string): CliSessionMode {
  const lines = readFileSync(scriptPath, "utf-8")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith('"')) {
        try {
          return JSON.parse(line) as string;
        } catch { /* ignore */ }
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
    // Not `async` (the body has nothing to await, which require-await forbids);
    // returns the confirmation wrapped in a resolved Promise instead.
    confirmToolCall: (_preview): Promise<ToolCallConfirmation> => {
      if (autoConfirm) {
        autoCallCount++;
        // Hard cap for unattended runs: once past the budget, deny every further
        // call so the agent (already bounded by the loop's maxSteps) winds down
        // rather than running unbounded. No prompt — scripted stdin is closed.
        if (autoCallCount > maxToolCalls) {
          return Promise.resolve({
            approved: false,
            message: `Stopped after tool call limit of ${maxToolCalls}.`,
          });
        }
        process.stderr.write(chalk.dim("Auto-approved.\n"));
        return Promise.resolve({ approved: true });
      }

      const choice = parseScriptedToolChoice(lines[lineIdx]);
      if (choice) {
        const rawChoice = lines[lineIdx]?.trim() ?? "";
        lineIdx++;
        formatScriptedToolMenu(choice);
        console.log(chalk.dim(`Scripted selection: ${rawChoice}`));

        if (choice === "approve") return Promise.resolve({ approved: true });

        const message = lines[lineIdx] ?? "";
        if (message) {
          lineIdx++;
          console.log(
            chalk.yellow(`Tell the agent what to do instead: ${message}`),
          );
        } else {
          console.log(chalk.yellow("Tell the agent what to do instead:"));
        }
        return Promise.resolve({ approved: false, message });
      }

      formatScriptedToolMenu("deny");
      console.log(
        chalk.dim("No scripted approval provided; denying tool call."),
      );
      return Promise.resolve({ approved: false });
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
