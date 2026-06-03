import { existsSync, readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';
import { agentLoop, type AgentLoopResult } from '../agent/loop.js';
import type { ConfirmToolCall } from '../agent/tools/index.js';
import { loadConfig, resolveApiKey, resolveModelSettings } from '../config/index.js';
import { toErrorMessage } from '../util/errors.js';
import { log, logError } from '../logger.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';
import { getAllModelDataSources, type ModelDataSourceKind } from '../providers/model-sources.js';
import {
  addAnthropicSessionCost,
  describeCostEstimate,
  describeCostEstimateBreakdown,
  formatUsdCeil,
  resetAnthropicSessionCost,
} from '../providers/anthropic-cost.js';
import { addOpenAISessionCost } from '../providers/openai-cost.js';
import { formatCapturedProviderUsages } from '../providers/adapters/openai-compat.js';
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
  runClaudeHelp?(userMessage: string): Promise<void>;
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

function formatSourceKind(kind: ModelDataSourceKind): string {
  switch (kind) {
    case 'official': return 'Official provider sources';
    case 'gateway': return 'Gateway sources';
    case 'aggregator': return 'Aggregator registries';
    case 'observability': return 'Observability references';
    case 'reference': return 'Comparison references';
  }
}

function showModelDataSources(): void {
  const sources = getAllModelDataSources();
  const order: ModelDataSourceKind[] = ['official', 'gateway', 'aggregator', 'observability', 'reference'];

  console.log(chalk.bold('Model Data Sources'));
  console.log(chalk.dim('Static source catalog for display and future gatherers. No token-cost estimates are made here.\n'));

  for (const kind of order) {
    const group = sources.filter(source => source.kind === kind);
    if (group.length === 0) continue;

    console.log(chalk.bold(formatSourceKind(kind)));
    for (const source of group) {
      const machine = source.machineReadable === 'yes' ? 'machine-readable' : `${source.machineReadable} machine-readable`;
      console.log(chalk.cyan(`  ${source.name}`) + chalk.gray(` [${source.trust}, ${machine}]`));
      console.log(chalk.gray(`    ${source.url}`));
      console.log(chalk.gray(`    Provides: ${source.provides.join(', ')}`));
      if (source.caveats.length > 0) {
        console.log(chalk.gray(`    Caveat: ${source.caveats[0]}`));
      }
    }
    console.log('');
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

    const resultJsonPath = process.env['FREECODE_RESULT_JSON'];
    if (resultJsonPath) {
      try {
        const entry = {
          totalTokens: result.usage.totalTokens,
          promptTokens: result.usage.promptTokens,
          outputTokens: result.usage.outputTokens,
          providerId: result.providerId,
          modelId: result.modelId,
          quota: result.quota ?? undefined,
        };
        const existing: unknown[] = existsSync(resultJsonPath) ? JSON.parse(readFileSync(resultJsonPath, 'utf-8')) : [];
        existing.push(entry);
        writeFileSync(resultJsonPath, JSON.stringify(existing, null, 2), 'utf-8');
      } catch (err) {
        logError('eval', `Failed to write result JSON to ${resultJsonPath}`, err);
      }
    }

    runtime.session.addAssistantMessage(result.text);
    runtime.session.saveExchange(input, result.text, result.usage.totalTokens);

    if (result.providerId === 'anthropic' || result.providerId === 'openai') {
      const sessionTotal = result.providerId === 'anthropic'
        ? addAnthropicSessionCost(result.costEstimate)
        : addOpenAISessionCost(result.costEstimate);
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

  if (normalized === '/claude' || normalized.startsWith('/claude ')) {
    const userMessage = trimmed.slice('/claude'.length).trim();
    if (runtime.runClaudeHelp) {
      await runtime.runClaudeHelp(userMessage);
    } else {
      console.log(chalk.dim('/claude is only available in interactive mode.'));
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

  if (normalized === '/sources' || normalized === '/model-sources') {
    showModelDataSources();
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
