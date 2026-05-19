import chalk from 'chalk';
import { agentLoop, type AgentLoopResult } from '../agent/loop.js';
import type { ConfirmToolCall } from '../agent/tools/index.js';
import { loadConfig } from '../config/index.js';
import { log } from '../logger.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import { testAllProviders } from '../providers/router.js';
import { detectOllama } from '../providers/ollama.js';
import {
  addAnthropicSessionCost,
  describeCostEstimate,
  describeCostEstimateBreakdown,
  formatUsdCeil,
  resetAnthropicSessionCost,
} from '../providers/anthropic-cost.js';
import { showBanner } from './banner.js';
import { showHelp } from './slash-commands.js';
import type { SessionController } from './session-controller.js';

export type CommandDispatchResult = 'continue' | 'exit';
export type ModelListMode = 'current-only' | 'full';

export interface CommandRuntime {
  projectRoot: string;
  session: SessionController;
  getSelectedModel(): string;
  setSelectedModel(model: string): void;
  confirmToolCall: ConfirmToolCall;
  modelListMode: ModelListMode;
  skipStrayConfirmations?: boolean;
  beforeAgentCall?(): void | Promise<void>;
  afterAgentCall?(): void | Promise<void>;
  onAgentResult?(result: AgentLoopResult): void | Promise<void>;
  beforeScreenClear?(): void | Promise<void>;
  afterScreenClear?(): void | Promise<void>;
  runConfig?(): Promise<void>;
  runModelMenu?(): Promise<void>;
  runTestMenu(): Promise<void>;
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

function showKeyStatus(): void {
  const config = loadConfig();
  console.log(chalk.bold('API Keys Status:\n'));
  for (const provider of PROVIDER_REGISTRY) {
    const envKey = process.env[provider.apiKeyEnvVar];
    const configKey = config.providers[provider.id]?.apiKey;
    if (envKey) {
      console.log(chalk.green(`${provider.name}:`) + chalk.gray(` env (${envKey.slice(0, 8)}...)`));
    } else if (configKey) {
      console.log(chalk.green(`${provider.name}:`) + chalk.gray(` config (${configKey.slice(0, 8)}...)`));
    } else {
      console.log(chalk.dim(`${provider.name}:`) + chalk.gray(' not set'));
    }
  }
}

export function formatQuotaReset(ms: number | null, raw: string | null): string {
  if (raw?.trim()) return raw;
  if (ms === null) return '?';

  let totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds -= hours * 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join('');
}

async function showModelStatus(runtime: CommandRuntime): Promise<void> {
  console.log(chalk.blue('Current model: ' + runtime.getSelectedModel()));
  if (runtime.modelListMode === 'current-only') return;

  console.log(chalk.dim('Available providers:\n'));
  const [statuses, ollamaModels] = await Promise.all([testAllProviders(), detectOllama()]);
  const statusMap = new Map(statuses.map(s => [s.providerId, s]));
  let any = false;

  for (const provider of PROVIDER_REGISTRY) {
    const status = statusMap.get(provider.id);
    if (!status) continue;
    const statusIcon = status.ok ? chalk.green('OK') : chalk.red('FAIL');
    const errorInfo = status.error ? chalk.red(` - ${status.error}`) : '';
    console.log(chalk.bold(`${provider.name}`) + ' ' + statusIcon + errorInfo);
    if (status.ok) {
      any = true;
      for (const model of provider.models) {
        console.log(chalk.cyan(`  ${provider.id}:${model.id}`) + chalk.gray(` (${model.displayName})`));
      }
    }
  }

  if (ollamaModels.length > 0) {
    any = true;
    console.log(chalk.bold.green('Ollama (local)') + ' ' + chalk.green('OK'));
    for (const model of ollamaModels) {
      console.log(chalk.cyan(`  ollama:${model.id}`) + chalk.gray(` (${model.displayName})`));
    }
  }

  if (!any) {
    console.log(chalk.red('\nNo providers available.'));
  }
}

async function sendToAgent(input: string, runtime: CommandRuntime): Promise<void> {
  runtime.session.addUserMessage(input);

  await runtime.beforeAgentCall?.();
  try {
    const result = await agentLoop(runtime.session.messages, runtime.projectRoot, runtime.getSelectedModel() ?? undefined, {
      confirmToolCall: runtime.confirmToolCall,
    });

    if (!result.text.trim()) {
      console.log(chalk.yellow('(empty response from model)'));
    }

    await runtime.onAgentResult?.(result);

    runtime.session.addAssistantMessage(result.text);
    runtime.session.saveExchange(input, result.text, result.usage.totalTokens);

    if (result.providerId === 'anthropic') {
      const sessionTotal = addAnthropicSessionCost(result.costEstimate);
      console.log(chalk.gray(
        `Estimated API cost: ${describeCostEstimate(result.costEstimate)} this turn | ${formatUsdCeil(sessionTotal)} session`
      ));
      const breakdown = describeCostEstimateBreakdown(result.costEstimate);
      if (breakdown) console.log(chalk.gray(breakdown));
    }

    console.log();
  } catch (error) {
    log('error', 'agentLoop threw', { error: error instanceof Error ? error.message : String(error) });
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
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
      await showModelStatus(runtime);
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

  if (normalized === '/test') {
    await runtime.runTestMenu();
    return 'continue';
  }

  if (normalized === '/eval') {
    await runtime.runEvalMenu();
    return 'continue';
  }

  if (normalized === '/keys') {
    showKeyStatus();
    return 'continue';
  }

  if (normalized === '/resume') {
    const resumed = runtime.session.resumeLast();
    if (!resumed) {
      console.log(chalk.dim('No previous session to resume.'));
      return 'continue';
    }
    console.log(chalk.green(`Resumed session ${resumed.id.slice(0, 8)}...`));
    console.log(chalk.dim(`${resumed.messageCount} messages loaded.\n`));
    return 'continue';
  }

  if (normalized === '/clear') {
    runtime.session.clearMessages();
    resetAnthropicSessionCost();
    await runtime.beforeScreenClear?.();
    showBanner();
    await runtime.afterScreenClear?.();
    console.log(chalk.dim('Chat history cleared.'));
    return 'continue';
  }

  await sendToAgent(trimmed, runtime);
  return 'continue';
}
