/**
 * @role Generic loop that reads inputs from a mode and dispatches them until EOF or exit.
 *
 * @readwhen
 * - Changing the CLI loop that reads inputs and dispatches them until EOF or an exit result.
 * - Adding or altering CliSessionMode lifecycle hooks like beforeDispatch, onExit, or onInputExhausted.
 * - Debugging why a session stops early, given EOF, exit-result, and hook-ordering behaviour.
 */

import type { AgentLoopResult } from '../agent/loop.js';
import type { ConfirmToolCall } from '../agent/tools/index.js';
import { dispatchCommand, type ModelListMode } from './command-dispatcher.js';
import type { Conversation } from '../agent/conversation.js';

export interface CliSessionMode {
  readInput(this: void): Promise<string | null>;
  confirmToolCall: ConfirmToolCall;
  getReadOnly?(this: void): boolean;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(this: void): void | Promise<void>;
  afterAgentCall?(this: void): void | Promise<void>;
  onAgentResult?(this: void, result: AgentLoopResult): void | Promise<void>;
  onStepUsage?(this: void, info: { providerId: string; modelId: string; promptTokens: number }): void;
  beforeScreenClear?(this: void): void | Promise<void>;
  afterScreenClear?(this: void): void | Promise<void>;
  runConfig?(this: void): Promise<void>;
  runModelMenu?(this: void): Promise<void>;
  runEvalMenu(this: void): Promise<void>;
  beforeDispatch?(this: void): void | Promise<void>;
  afterDispatch?(this: void): void | Promise<void>;
  onExit?(this: void): void | Promise<void>;
  onInputExhausted?(this: void): void | Promise<void>;
}

interface CliSessionRunnerOptions {
  projectRoot: string;
  session: Conversation;
  getSelectedModel(this: void): string;
  setSelectedModel(this: void, model: string): void;
  mode: CliSessionMode;
}

export async function runCliSession(options: CliSessionRunnerOptions): Promise<void> {
  const { projectRoot, session, getSelectedModel, setSelectedModel, mode } = options;

  while (true) {
    const input = await mode.readInput();
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
        getReadOnly: mode.getReadOnly,
        modelListMode: mode.modelListMode,
        skipStrayConfirmations: mode.skipStrayConfirmations,
        beforeAgentCall: mode.beforeAgentCall,
        afterAgentCall: mode.afterAgentCall,
        onAgentResult: mode.onAgentResult,
        onStepUsage: mode.onStepUsage,
        beforeScreenClear: mode.beforeScreenClear,
        afterScreenClear: mode.afterScreenClear,
        runConfig: mode.runConfig,
        runModelMenu: mode.runModelMenu,
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
