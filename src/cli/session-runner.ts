import type { AgentLoopResult } from '../agent/loop.js';
import type { ConfirmToolCall } from '../agent/tools/index.js';
import { dispatchCommand, type ModelListMode } from './command-dispatcher.js';
import type { SessionController } from './session-controller.js';

export interface CliSessionMode {
  readInput(tokenCount: number): Promise<string | null>;
  confirmToolCall: ConfirmToolCall;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(): void | Promise<void>;
  afterAgentCall?(): void | Promise<void>;
  onAgentResult?(result: AgentLoopResult): void | Promise<void>;
  beforeScreenClear?(): void | Promise<void>;
  afterScreenClear?(): void | Promise<void>;
  runConfig?(): Promise<void>;
  runTestMenu(): Promise<void>;
  runEvalMenu(): Promise<void>;
  onExit?(): void | Promise<void>;
  onInputExhausted?(): void | Promise<void>;
}

interface CliSessionRunnerOptions {
  projectRoot: string;
  session: SessionController;
  getSelectedModel(): string;
  setSelectedModel(model: string): void;
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

    const result = await dispatchCommand(input, {
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
      runTestMenu: mode.runTestMenu,
      runEvalMenu: mode.runEvalMenu,
    });

    if (result === 'exit') {
      await mode.onExit?.();
      return;
    }
  }
}
