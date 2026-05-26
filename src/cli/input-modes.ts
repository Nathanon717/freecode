import { readFileSync } from 'fs';
import type { Interface } from 'readline';
import chalk from 'chalk';
import { runConfigCommand } from '../commands/config.js';
import { runModelCommand } from '../commands/model.js';
import { formatArgs, type ToolCallConfirmation, type ToolCallPreview } from '../agent/tools/index.js';
import { loadConfig } from '../config/index.js';
import { getCommandCompletion, getFilteredCommands } from './slash-commands.js';
import { printScriptedScenarioList, runEvalMenu, runTestMenu } from './scenario-menu.js';
import type { SessionController } from './session-controller.js';
import type { CliSessionMode } from './session-runner.js';
import {
  appendToInputBuffer,
  backspaceInputBuffer,
  drawBottomUI,
  getInputBuffer,
  getLastReservedRows,
  getRows,
  isBottomUIActive,
  isFooterUIActive,
  parkCursorAboveBottomUI,
  parkCursorInScrollRegion,
  printTurnDivider,
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
  setupFooterUI,
  setupInputUI,
  teardownBottomUI,
  teardownFooterUI,
} from './terminal-ui.js';
import { createOpenAIPreflightInputController } from './preflight-input-cost.js';
import { refreshOpenAIDailySpend } from './openai-daily-spend.js';

type ToolApprovalChoice = 'approve' | 'deny';

function askQuestion(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function drawToolApprovalMenu(selected: ToolApprovalChoice): void {
  const approve = selected === 'approve' ? chalk.inverse('> Approve') : '  Approve';
  const deny = selected === 'deny' ? chalk.inverse('> Deny') : '  Deny';
  process.stdout.write(`\r\x1b[2K${approve}\n\r\x1b[2K${deny}`);
}

// Draws the tool menu options at absolute terminal rows, above the pinned footer.
// headerRow = r - reserved - 2, approveRow = r - reserved - 1, denyRow = r - reserved.
// Parks the cursor at the selected row so it doesn't drift into the footer.
function drawToolApprovalMenuAbsolute(selected: ToolApprovalChoice, r: number, reserved: number, header?: string): void {
  const approve = selected === 'approve' ? chalk.inverse('> Approve') : '  Approve';
  const deny = selected === 'deny' ? chalk.inverse('> Deny') : '  Deny';
  const w = process.stdout.columns || 80;
  const headerText = header ? chalk.cyan(header.slice(0, w - 1)) : '';
  const cursorRow = selected === 'approve' ? r - reserved - 1 : r - reserved;
  process.stdout.write(
    `\x1b[${r - reserved - 2};1H\x1b[2K${headerText}` +
    `\x1b[${r - reserved - 1};1H\x1b[2K${approve}` +
    `\x1b[${r - reserved};1H\x1b[2K${deny}` +
    `\x1b[${cursorRow};1H`,
  );
}

function resetBottomPromptState(session: SessionController): void {
  setTokenCount(session.getContextTokenCount());
  setInputBuffer('');
  setInlineCompletion(null);
  setPreflightInputCost({ state: 'idle', providerId: '', modelId: '', updatedAt: Date.now() });
  setSuggestions(getFilteredCommands(''));
}

function applyModelStatus(model: string): void {
  const idx = model.indexOf(':');
  if (idx !== -1) {
    setModelStatus(model.slice(0, idx), model.slice(idx + 1));
  } else if (model) {
    setModelStatus('', model);
  }
}

function refreshFooterDailySpend(getSelectedModel: () => string): void {
  refreshOpenAIDailySpend({
    setOpenAIDailySpend,
    redraw: drawBottomUI,
    modelPreference: getSelectedModel,
  });
}

async function readToolApprovalMenu(rl: Interface, header?: string): Promise<ToolApprovalChoice> {
  if (!process.stdin.isTTY) {
    rl.resume();
    while (true) {
      const answer = (await askQuestion(rl, chalk.yellow('Approve this tool call? [approve/deny] '))).trim().toLowerCase();
      if (answer === '' || answer === 'approve' || answer === 'a' || answer === 'y' || answer === 'yes') return 'approve';
      if (answer === 'deny' || answer === 'd' || answer === 'n' || answer === 'no') return 'deny';
      console.log(chalk.dim('Please answer approve or deny.'));
    }
  }

  let selected: ToolApprovalChoice = 'approve';

  const useAbsolute = isFooterUIActive();
  if (useAbsolute) {
    const r = getRows();
    const reserved = getLastReservedRows();
    drawToolApprovalMenuAbsolute(selected, r, reserved, header);
  } else {
    drawToolApprovalMenu(selected);
  }

  return new Promise<ToolApprovalChoice>((resolve) => {
    rl.pause();

    // Remove readline's stdin listeners to prevent history-recall side-effects while in raw mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const savedListeners = process.stdin.rawListeners('data') as ((...args: any[]) => void)[];
    process.stdin.removeAllListeners('data');

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function redraw() {
      if (useAbsolute) {
        drawToolApprovalMenuAbsolute(selected, getRows(), getLastReservedRows(), header);
      } else {
        process.stdout.write('\r\x1b[1A');
        drawToolApprovalMenu(selected);
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      // Restore readline's listeners.
      for (const listener of savedListeners) {
        process.stdin.on('data', listener);
      }
    }

    function finish(choice: ToolApprovalChoice) {
      cleanup();
      resolve(choice);
    }

    function onData(data: string) {
      if (data === '\x03') {
        cleanup();
        process.exit(0);
      }

      if (data === '\r' || data === '\n') {
        process.stdout.write('\n');
        finish(selected);
        return;
      }

      if (data === '\x1b[B' || data === 'j') {
        selected = 'deny';
        redraw();
        return;
      }

      if (data === '\x1b[A' || data === 'k') {
        selected = 'approve';
        redraw();
        return;
      }

      if (data.toLowerCase() === 'a') {
        selected = 'approve';
        redraw();
        return;
      }

      if (data.toLowerCase() === 'd') {
        selected = 'deny';
        redraw();
      }
    }

    process.stdin.on('data', onData);
  });
}

async function confirmToolCallInteractive(rl: Interface, preview: ToolCallPreview): Promise<ToolCallConfirmation> {
  const restoreInputUI = isBottomUIActive();
  teardownBottomUI();

  const header = `${preview.name}(${formatArgs(preview.args)})`;

  try {
    const choice = await readToolApprovalMenu(rl, header);
    if (choice === 'approve') return { approved: true };

    rl.resume();
    const message = (await askQuestion(rl, chalk.yellow('Tell the agent what to do instead: '))).trim();
    return {
      approved: false,
      message,
    };
  } finally {
    rl.pause();
    if (restoreInputUI && process.stdin.isTTY) setupInputUI();
  }
}

function formatScriptedToolMenu(choice: ToolApprovalChoice): void {
  console.log(choice === 'approve' ? chalk.inverse('> Approve') : '  Approve');
  console.log(choice === 'deny' ? chalk.inverse('> Deny') : '  Deny');
}

function parseScriptedToolChoice(input: string | undefined): ToolApprovalChoice | null {
  const normalized = input?.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes' || normalized === 'approve' || normalized === 'a') {
    return 'approve';
  }
  if (normalized === 'n' || normalized === 'no' || normalized === 'deny' || normalized === 'd') {
    return 'deny';
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
    return askQuestion(rl, chalk.green('> '));
  }

  setTokenCount(tokenCount);
  setInputBuffer('');
  setInlineCompletion(null);
  setPreflightInputCost({ state: 'idle', providerId: '', modelId: '', updatedAt: Date.now() });
  setSuggestions(getFilteredCommands(''));
  refreshFooterDailySpend(getSelectedModel);
  setupInputUI();
  drawBottomUI();

  return new Promise<string>((resolve) => {
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

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
      process.stdin.removeListener('data', onData);
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
      if (data === '\x03') {
        cleanup();
        teardownFooterUI();
        process.exit(0);
      }

      if (data === '\r' || data === '\n') {
        const submitted = completedInput();
        setInputBuffer('');
        setInlineCompletion(null);
        setSuggestions([]);
        resetSubmittedInputArea();
        parkCursorInScrollRegion();
        process.stdout.write(chalk.green('> ') + submitted + '\r\n');
        cleanup();
        resolve(submitted);
        return;
      }

      if (data === '\t') {
        const completion = getCommandCompletion(getInputBuffer());
        if (completion) {
          setInputBuffer(completion);
          refresh();
        }
        return;
      }

      if (data === '\x7f' || data === '\x08') {
        if (getInputBuffer().length > 0) {
          backspaceInputBuffer();
          refresh();
        }
        return;
      }

      // Arrow keys and other escape sequences: ignore.
      if (data.startsWith('\x1b[') || data.startsWith('\x1bO')) return;

      if (data === '\x1b') {
        if (getInputBuffer().length > 0) {
          setInputBuffer('');
          refresh();
        }
        return;
      }

      const printable = [...data].filter(c => c >= ' ').join('');
      if (printable) {
        appendToInputBuffer(printable);
        refresh();
      }
    }

    process.stdin.on('data', onData);
  });
}

const TOOL_CALL_LIMIT = 10;

async function askContinueAfterLimit(rl: Interface, count: number): Promise<boolean> {
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();
  try {
    const answer = await askQuestion(
      rl,
      chalk.yellow(`\n${count} tool calls used this turn. Continue? [Y/n] `),
    );
    return answer.trim().toLowerCase() !== 'n';
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
  let toolCallsThisTurn = 0;

  async function confirmToolCall(preview: ToolCallPreview): Promise<ToolCallConfirmation> {
    toolCallsThisTurn++;
    if (toolCallsThisTurn % TOOL_CALL_LIMIT === 0) {
      const shouldContinue = await askContinueAfterLimit(rl, toolCallsThisTurn);
      if (!shouldContinue) return { approved: false, message: 'Stopped by user after tool call limit.' };
    }
    if (config.toolConfirmation === 'auto') {
      console.log(chalk.dim(`Auto-approved: ${preview.name}(${formatArgs(preview.args)})`));
      return { approved: true };
    }
    return confirmToolCallInteractive(rl, preview);
  }

  return {
    readInput: (tokenCount) => readLineWithAutocomplete(rl, tokenCount, session, getSelectedModel),
    confirmToolCall,
    modelListMode: 'full',
    beforeAgentCall: () => {
      toolCallsThisTurn = 0;
      if (process.stdin.isTTY) teardownBottomUI();
      resetBottomPromptState(session);
      printTurnDivider();
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
    },
    beforeDispatch: () => {
      if (process.stdin.isTTY) {
        teardownBottomUI();
        parkCursorAboveBottomUI();
      }
    },
    afterDispatch: () => {
      if (process.stdin.isTTY) {
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
      if (process.stdin.isTTY) setupBottomUI();
    },
    runModelMenu: async () => {
      teardownBottomUI();
      rl.resume();
      await runModelCommand(rl, getSelectedModel(), setSelectedModel);
      rl.pause();
      applyModelStatus(getSelectedModel());
      if (process.stdin.isTTY) {
        setupBottomUI();
        resetBottomPromptState(session);
        refreshFooterDailySpend(getSelectedModel);
        drawBottomUI();
      }
    },
    runTestMenu: () => runTestMenu(rl, projectRoot),
    runEvalMenu: () => runEvalMenu(rl, projectRoot, getSelectedModel),
    onExit: () => {
      teardownFooterUI();
    },
  };
}

export function createScriptedMode(scriptPath: string, projectRoot: string): CliSessionMode {
  const lines = readFileSync(scriptPath, 'utf-8')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0);
  let lineIdx = 0;

  const autoConfirm = process.env['FREECODE_AUTO_CONFIRM'] === '1';
  const maxToolCalls = parseInt(process.env['FREECODE_MAX_TOOL_CALLS'] ?? '10', 10);
  let autoCallCount = 0;

  return {
    readInput: async () => {
      if (lineIdx >= lines.length) return null;
      const line = lines[lineIdx++];
      console.log(chalk.green('> ') + line);
      return line;
    },
    confirmToolCall: async (preview) => {
      if (autoConfirm) {
        autoCallCount++;
        if (autoCallCount > maxToolCalls) {
          console.log(chalk.red(`Auto-confirm limit of ${maxToolCalls} tool calls reached; denying.`));
          return { approved: false, message: `Auto-confirm limit of ${maxToolCalls} tool calls reached.` };
        }
        process.stderr.write(chalk.dim('Auto-approved.\n'));
        return { approved: true };
      }

      const choice = parseScriptedToolChoice(lines[lineIdx]);
      if (choice) {
        const rawChoice = lines[lineIdx]?.trim() ?? '';
        lineIdx++;
        formatScriptedToolMenu(choice);
        console.log(chalk.dim(`Scripted selection: ${rawChoice}`));

        if (choice === 'approve') return { approved: true };

        const message = lines[lineIdx] ?? '';
        if (message) {
          lineIdx++;
          console.log(chalk.yellow(`Tell the agent what to do instead: ${message}`));
        } else {
          console.log(chalk.yellow('Tell the agent what to do instead:'));
        }
        return { approved: false, message };
      }

      formatScriptedToolMenu('deny');
      console.log(chalk.dim('No scripted approval provided; denying tool call.'));
      return { approved: false };
    },
    modelListMode: 'current-only',
    skipStrayConfirmations: true,
    runTestMenu: async () => {
      printScriptedScenarioList(projectRoot);
    },
    runEvalMenu: async () => {
      console.log(chalk.dim('/eval is not available in scripted mode.'));
    },
    onInputExhausted: () => {
      console.log(chalk.dim('Goodbye!'));
    },
  };
}
