import type { AgentLoopResult } from '../agent/loop.js';
import type { ConfirmToolCall } from '../agent/tools/index.js';
import { dispatchCommand, type ModelListMode } from './command-dispatcher.js';
import type { SessionController } from './session-controller.js';

export interface CliSessionMode {
  readInput(this: void, tokenCount: number): Promise<string | null>;
  confirmToolCall: ConfirmToolCall;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(this: void): void | Promise<void>;
  afterAgentCall?(this: void): void | Promise<void>;
  onAgentResult?(this: void, result: AgentLoopResult): void | Promise<void>;
  beforeScreenClear?(this: void): void | Promise<void>;
  afterScreenClear?(this: void): void | Promise<void>;
  runConfig?(this: void): Promise<void>;
  runModelMenu?(this: void): Promise<void>;
  runClaudeHelp?(this: void, userMessage: string): Promise<void>;
  runTestMenu(this: void): Promise<void>;
  runEvalMenu(this: void): Promise<void>;
  beforeDispatch?(this: void): void | Promise<void>;
  afterDispatch?(this: void): void | Promise<void>;
  onExit?(this: void): void | Promise<void>;
  onInputExhausted?(this: void): void | Promise<void>;
}

interface CliSessionRunnerOptions {
  projectRoot: string;
  session: SessionController;
  getSelectedModel(this: void): string;
  setSelectedModel(this: void, model: string): void;
  mode: CliSessionMode;
}

export async function runCliSession(options: CliSessionRunnerOptions): Promise<void> {
  const { projectRoot, session, getSelectedModel, setSelectedModel, mode } = options;

  while (true) {
    const input = await mode.readInput(session.getContextTokenCount());
    if (input === null) {
      await mode.onInputExhausted?.();
      return;
    }

    let result: Awaited<ReturnType<typeof dispatchCommand>>;
    await mode.beforeDispatch?.();
    try {
      result = await dispatchCommand(input, {
        projectRoot,
        session,
        getSelectedModel,
        setSelectedModel,
        confirmToolCall: mode.confirmToolCall,
        modelListMode: mode.modelListMode,
        skipStrayConfirmations: mode.skipStrayConfirmations,
        beforeAgentCall: mode.beforeAgentCall,
        afterAgentCall: mode.afterAgentCall,
        onAgentResult: mode.onAgentResult,
        beforeScreenClear: mode.beforeScreenClear,
        afterScreenClear: mode.afterScreenClear,
        runConfig: mode.runConfig,
        runModelMenu: mode.runModelMenu,
        runClaudeHelp: mode.runClaudeHelp,
        runTestMenu: mode.runTestMenu,
        runEvalMenu: mode.runEvalMenu,
      });
    } finally {
      await mode.afterDispatch?.();
    }

    if (result === 'exit') {
      await mode.onExit?.();
      return;
    }
  }
}
