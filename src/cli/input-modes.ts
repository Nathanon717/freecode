import { readFileSync } from 'fs';
import type { Interface } from 'readline';
import chalk from 'chalk';
import { runConfigCommand } from '../commands/config.js';
import type { ToolCallConfirmation, ToolCallPreview } from '../agent/tools/index.js';
import { getCommandCompletion, getFilteredCommands } from './slash-commands.js';
import { printScriptedScenarioList, runEvalMenu, runTestMenu } from './scenario-menu.js';
import type { SessionController } from './session-controller.js';
import type { CliSessionMode } from './session-runner.js';
import {
  appendToInputBuffer,
  backspaceInputBuffer,
  drawBottomUI,
  getInputBuffer,
  isBottomUIActive,
  parkCursorInScrollRegion,
  resetSubmittedInputArea,
  setInputBuffer,
  setInlineCompletion,
  setModelStatus,
  setQuotaSnapshot,
  setSuggestions,
  setTokenCount,
  setupBottomUI,
  teardownBottomUI,
} from './terminal-ui.js';

type ToolApprovalChoice = 'approve' | 'deny';

function askQuestion(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

function formatToolArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ');
}

function drawToolApprovalMenu(selected: ToolApprovalChoice): void {
  const approve = selected === 'approve' ? chalk.inverse('> Approve') : '  Approve';
  const deny = selected === 'deny' ? chalk.inverse('> Deny') : '  Deny';
  process.stdout.write(`\r\x1b[2K${approve}\n\r\x1b[2K${deny}`);
}

async function readToolApprovalMenu(rl: Interface): Promise<ToolApprovalChoice> {
  if (!process.stdin.isTTY) {
    while (true) {
      const answer = (await askQuestion(rl, chalk.yellow('Approve this tool call? [approve/deny] '))).trim().toLowerCase();
      if (answer === '' || answer === 'approve' || answer === 'a' || answer === 'y' || answer === 'yes') return 'approve';
      if (answer === 'deny' || answer === 'd' || answer === 'n' || answer === 'no') return 'deny';
      console.log(chalk.dim('Please answer approve or deny.'));
    }
  }

  let selected: ToolApprovalChoice = 'approve';
  console.log(chalk.yellow('Select tool action:'));
  drawToolApprovalMenu(selected);

  return new Promise<ToolApprovalChoice>((resolve) => {
    rl.pause();
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function redraw() {
      process.stdout.write('\r\x1b[1A');
      drawToolApprovalMenu(selected);
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
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
  const restoreBottomUI = isBottomUIActive();
  teardownBottomUI();
  rl.resume();

  try {
    const args = formatToolArgs(preview.args);
    console.log(chalk.cyan(`\nTool request: ${preview.name}(${args})`));

    const choice = await readToolApprovalMenu(rl);
    if (choice === 'approve') return { approved: true };

    rl.resume();
    const message = (await askQuestion(rl, chalk.yellow('Tell the agent what to do instead: '))).trim();
    return {
      approved: false,
      message,
    };
  } finally {
    rl.pause();
    if (restoreBottomUI && process.stdin.isTTY) setupBottomUI();
  }
}

export async function denyToolCallWithPreview(preview: ToolCallPreview): Promise<ToolCallConfirmation> {
  console.log(chalk.cyan(`\nTool request: ${preview.name}(${formatToolArgs(preview.args)})`));
  return { approved: false };
}

function formatScriptedToolMenu(choice: ToolApprovalChoice): void {
  console.log(chalk.yellow('Select tool action:'));
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

async function readLineWithAutocomplete(rl: Interface, tokenCount: number): Promise<string> {
  if (!process.stdin.isTTY) {
    return askQuestion(rl, chalk.green('> '));
  }

  setTokenCount(tokenCount);
  setInputBuffer('');
  setInlineCompletion(null);
  setSuggestions(getFilteredCommands(''));
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
      drawBottomUI();
    }

    function completedInput(): string {
      return getCommandCompletion(getInputBuffer()) ?? getInputBuffer();
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    function onData(data: string) {
      if (data === '\x03') {
        cleanup();
        teardownBottomUI();
        process.exit(0);
      }

      if (data === '\r' || data === '\n') {
        const submitted = completedInput();
        setInputBuffer('');
        setInlineCompletion(null);
        setSuggestions([]);
        resetSubmittedInputArea();
        parkCursorInScrollRegion();
        process.stdout.write(chalk.green('> ') + submitted + '\n');
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

export function createInteractiveMode(rl: Interface, projectRoot: string, session: SessionController): CliSessionMode {
  return {
    readInput: (tokenCount) => readLineWithAutocomplete(rl, tokenCount),
    confirmToolCall: (preview) => confirmToolCallInteractive(rl, preview),
    modelListMode: 'full',
    beforeAgentCall: () => {
      if (process.stdin.isTTY) teardownBottomUI();
      setTokenCount(session.getContextTokenCount());
      setInputBuffer('');
      setInlineCompletion(null);
      setSuggestions([]);
    },
    afterAgentCall: () => {
      if (process.stdin.isTTY) {
        setupBottomUI();
        setTokenCount(session.getContextTokenCount());
        setInputBuffer('');
        setInlineCompletion(null);
        setSuggestions(getFilteredCommands(''));
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
    runConfig: async () => {
      teardownBottomUI();
      rl.resume();
      await runConfigCommand(rl);
      rl.pause();
      if (process.stdin.isTTY) setupBottomUI();
    },
    runTestMenu: () => runTestMenu(rl, projectRoot),
    runEvalMenu: () => runEvalMenu(rl, projectRoot),
    onExit: () => {
      teardownBottomUI();
    },
  };
}

export function createScriptedMode(scriptPath: string, projectRoot: string): CliSessionMode {
  const lines = readFileSync(scriptPath, 'utf-8')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0);
  let lineIdx = 0;

  return {
    readInput: async () => {
      if (lineIdx >= lines.length) return null;
      const line = lines[lineIdx++];
      console.log(chalk.green('> ') + line);
      return line;
    },
    confirmToolCall: async (preview) => {
      console.log(chalk.cyan(`\nTool request: ${preview.name}(${formatToolArgs(preview.args)})`));

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
      printScriptedScenarioList(projectRoot, false);
    },
    runEvalMenu: async () => {
      printScriptedScenarioList(projectRoot, true);
    },
    onInputExhausted: () => {
      console.log(chalk.dim('Goodbye!'));
    },
  };
}
