import chalk from 'chalk';
import type { AgentLoopResult } from '../agent/loop.js';
import type { ConfirmToolCall } from '../agent/tools/index.js';
import { resolveApiKey, resolveModelSettings } from '../config/index.js';
import { ensureStoreReady } from '../providers/db.js';
import { toErrorMessage } from '../util/errors.js';
import { log } from '../logger.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import {
  addAnthropicSessionCost,
  describeCostEstimate,
  describeCostEstimateBreakdown,
  formatUsdCeil,
  resetAnthropicSessionCost,
} from '../providers/anthropic-cost.js';
import { formatCapturedProviderUsages } from '../providers/adapters/openai-compat.js';
import { redrawBanner } from './banner.js';
import { showHelp } from './slash-commands.js';
import type { SessionController } from '../agent/session-controller.js';
import { setTokenCount } from './terminal-ui.js';
import {
  writeResultPlaceholder,
  makePartialResultUpdater,
  writeFinalResult,
} from '../eval/result-sink.js';

export type CommandDispatchResult = 'continue' | 'exit';
export type ModelListMode = 'current-only' | 'full';

export interface CommandRuntime {
  projectRoot: string;
  session: SessionController;
  getSelectedModel(): string;
  setSelectedModel(model: string): void;
  confirmToolCall: ConfirmToolCall;
  getReadOnly?(): boolean;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(): void | Promise<void>;
  afterAgentCall?(): void | Promise<void>;
  onAgentResult?(result: AgentLoopResult): void | Promise<void>;
  beforeScreenClear?(): void | Promise<void>;
  afterScreenClear?(): void | Promise<void>;
  runConfig?(): Promise<void>;
  runModelMenu?(): Promise<void>;
  runEvalMenu(): Promise<void>;
}

function isScriptedConfirmation(input: string): boolean {
  return input === 'y' || input === 'yes' || input === 'n' || input === 'no';
}

function getModelCommandArg(input: string): string | null {
  const normalized = input.toLowerCase();
  if (normalized === '/model') return '';
  if (normalized.startsWith('/model ')) return input.slice(6).trim();
  if (normalized === '/models') return '';
  if (normalized.startsWith('/models ')) return input.slice(7).trim();
  return null;
}

function showFlagsHelp(): void {
  console.log();
  console.log(chalk.bold('Flags:'));
  console.log(chalk.gray('  -log  Enable diagnostic logging to stderr (config, routing, stream, tools, db)'));
}


function showModelStatus(runtime: CommandRuntime): void {
  console.log(chalk.blue('Current model: ' + (runtime.getSelectedModel() || chalk.dim('(none)'))));
  if (runtime.modelListMode === 'current-only') return;

  console.log(chalk.dim('\nAvailable providers:\n'));
  let any = false;

  for (const provider of PROVIDER_REGISTRY) {
    if (!resolveApiKey(provider)) continue;
    any = true;
    console.log(chalk.bold.green(provider.name));
    for (const model of provider.models) {
      console.log(chalk.cyan(`  ${model.displayName}`) + chalk.gray(` [${provider.id}:${model.id}]`));
    }
  }

  if (!any) {
    console.log(chalk.red('No providers configured. Set an API key to get started.'));
  }
}

async function sendToAgent(input: string, runtime: CommandRuntime): Promise<void> {
  await ensureStoreReady();
  runtime.session.addUserMessage(input);

  await runtime.beforeAgentCall?.();
  try {
    const resultJsonPath = process.env['FREECODE_RESULT_JSON'];

    // Write an initial placeholder entry so the footer shows the correct model
    // immediately rather than waiting for the full agent loop to complete.
    if (resultJsonPath) {
      writeResultPlaceholder(resultJsonPath, runtime.getSelectedModel() ?? '');
    }

    // Imported lazily so the interactive boot path doesn't pull in the `ai`
    // SDK (~1.2s) until a turn actually runs.
    const { agentLoop } = await import('../agent/loop.js');
    const result = await agentLoop(runtime.session.messages, runtime.projectRoot, runtime.getSelectedModel() ?? undefined, {
      confirmToolCall: runtime.confirmToolCall,
      readOnly: runtime.getReadOnly?.() ?? false,
      onPartialResult: resultJsonPath ? makePartialResultUpdater(resultJsonPath) : undefined,
    });

    if (!result.text.trim()) {
      console.log(chalk.yellow('(empty response from model)'));
    }

    await runtime.onAgentResult?.(result);

    if (resultJsonPath) {
      writeFinalResult(resultJsonPath, {
        totalTokens: result.usage.totalTokens,
        promptTokens: result.usage.promptTokens,
        outputTokens: result.usage.outputTokens,
        providerId: result.providerId,
        modelId: result.modelId,
        quota: result.quota ?? undefined,
      });
    }

    runtime.session.addAssistantMessage(result.text);

    if (result.usage.promptTokens !== undefined) {
      setTokenCount(result.usage.promptTokens);
    }

    if (result.providerId === 'anthropic') {
      const sessionTotal = addAnthropicSessionCost(result.costEstimate);
      const costStr = describeCostEstimate(result.costEstimate, { colored: true });
      console.log(chalk.gray('Estimated API cost: ') + costStr + chalk.gray(` this turn | ${formatUsdCeil(sessionTotal)} session`));
      const breakdown = describeCostEstimateBreakdown(result.costEstimate);
      if (breakdown) console.log(chalk.gray(breakdown));
    }
    const providerUsage = formatCapturedProviderUsages(result.providerUsage);
    const effectiveSettings = resolveModelSettings(runtime.getSelectedModel());
    if (providerUsage && effectiveSettings.showProviderUsage) {
      console.log(chalk.gray('Provider usage:'));
      console.log(chalk.gray(providerUsage));
    }

    console.log();
  } catch (error) {
    log('error', 'agentLoop threw', { error: toErrorMessage(error) });
    console.log(chalk.red(`Error: ${toErrorMessage(error)}`));
    console.log();
  } finally {
    await runtime.afterAgentCall?.();
  }
}

export async function dispatchCommand(input: string, runtime: CommandRuntime): Promise<CommandDispatchResult> {
  const trimmed = input.trim();
  if (!trimmed) return 'continue';

  const normalized = trimmed.toLowerCase();
  if (runtime.skipStrayConfirmations && isScriptedConfirmation(normalized)) {
    console.log(chalk.dim('No pending tool request; skipping scripted confirmation.'));
    return 'continue';
  }

  const modelArg = getModelCommandArg(trimmed);
  if (modelArg !== null) {
    if (modelArg) {
      runtime.setSelectedModel(modelArg);
      console.log(chalk.blue(`Model set to: ${runtime.getSelectedModel()}`));
    } else if (runtime.runModelMenu) {
      await runtime.runModelMenu();
    } else {
      showModelStatus(runtime);
    }
    return 'continue';
  }

  if (normalized === '/config') {
    if (runtime.runConfig) {
      await runtime.runConfig();
    } else {
      console.log(chalk.dim('/config is only available in interactive mode.'));
    }
    return 'continue';
  }

  if (normalized === '/help') {
    showHelp();
    showFlagsHelp();
    return 'continue';
  }

  if (normalized === '/eval') {
    await runtime.runEvalMenu();
    return 'continue';
  }

  if (normalized === '/status') {
    const { runStatusCommand } = await import('../commands/status.js');
    runStatusCommand();
    return 'continue';
  }

  if (normalized === '/renderer') {
    const { runRendererDemo } = await import('../commands/renderer.js');
    runRendererDemo();
    return 'continue';
  }

  if (normalized === '/clear') {
    runtime.session.clearMessages();
    resetAnthropicSessionCost();
    await runtime.beforeScreenClear?.();
    redrawBanner();
    console.log(chalk.dim('Chat history cleared.'));
    await runtime.afterScreenClear?.();
    return 'continue';
  }

  if (trimmed.startsWith('/')) {
    const name = trimmed.split(' ')[0];
    console.log(chalk.red(`No command: ${name}`));
    return 'continue';
  }

  await sendToAgent(trimmed, runtime);
  return 'continue';
}
