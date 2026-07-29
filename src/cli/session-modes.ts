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
} from "./tools/tool-invocation.js";
import { runEvalMenu } from "./eval/eval-menu.js";
import { formatPromptEcho } from "./render/transcript-renderer.js";
import { recordTranscriptPrompt } from "./render/transcript-record.js";
import type { CliSessionMode } from "./session-runner.js";
import {
  drawBottomUI,
  drawFooter,
  parkCursorAboveBottomUI,
  parkCursorInScrollRegion,
  resetSubmittedInputArea,
  setInlineCompletion,
  setSuggestions,
  setupBottomUI,
  setupInputUI,
  teardownBottomUI,
  teardownFooterUI,
} from "./chrome/bottom-ui.js";
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
} from "./chrome/input-buffer.js";
import {
  setActiveModel,
  setActiveModelFromString,
  setContextUsage,
  setOpenAIDailySpend,
  setQuotaSnapshot,
} from "./chrome/footer-status.js";
import { getModel } from "../providers/model-data.js";
import { refreshOpenAIDailySpend } from "../providers/openai-daily-spend.js";
import { loadCachedQuota, saveQuotaToCache } from "../providers/quota/cache.js";
import { cycleByChar, getAskMode, initAskMode, isReadOnly } from "./chrome/toggles.js";
import {
  askQuestion,
  confirmToolCallInteractive,
} from "./tools/tool-approval.js";
import { runRawKeySession } from "./menus/raw-picker.js";
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
  // The old ctx belongs to the previous model (different token count for the
  // same history, different window). Blank it until the next turn measures the
  // new model, rather than briefly attributing a stale number to it.
  setContextUsage(null);
  warmTokenizers(model);
}

// Pushes a provider-reported prompt-token count to the footer, paired with the
// model's context window when the registry knows it.
function applyContextUsage(providerId: string, modelId: string, promptTokens: number): void {
  const entry = getModel(`${providerId}:${modelId}`);
  setContextUsage({ tokens: promptTokens, window: entry?.contextWindow ?? null });
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
        process.stdout.write(formatPromptEcho(submitted, '\r\n') + "\r\n");
        recordTranscriptPrompt(submitted);
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
      // Context size = the provider-reported prompt tokens of this turn's last
      // call (the full history it just sent). Only update when the provider
      // actually reported a count; a turn that errored before any usage keeps
      // the last good number rather than blanking or showing a guess.
      const promptTokens = result.usage?.promptTokens;
      if (result.providerId === 'anthropic') {
        // Anthropic reports input_tokens WITHOUT cache_read/cache_creation, so
        // once prompt caching kicks in the count reads far low (e.g. ~2k at 100k
        // real). Blank the slot rather than show a confident undercount, until
        // finalizeUsageCapture (usage-finalize.ts) sums the cache fields.
        setContextUsage(null);
      } else if (promptTokens !== undefined) {
        applyContextUsage(result.providerId, result.modelId, promptTokens);
      }
    },
    // Per-step tick: a multi-step tool turn resends a longer history each step,
    // so the context size grows *during* the turn. The footer survives a turn
    // (teardownBottomUI drops only the input area), so it can be repainted here.
    onStepUsage: ({ providerId, modelId, promptTokens }) => {
      // Anthropic's per-step count omits the cache fields and would read far
      // low; skip rather than blank, leaving onAgentResult's handling in charge.
      if (providerId === 'anthropic') return;
      applyContextUsage(providerId, modelId, promptTokens);
      // Repaint now instead of waiting on the 1 s footer timer: a step that
      // finishes inside that second would otherwise never show its value, and
      // the footer would jump straight to the final number as it did before.
      if (process.stdin.isTTY) drawFooter();
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

