import { existsSync, readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';
import { agentLoop, type AgentLoopResult } from '../agent/loop.js';
import type { ConfirmToolCall } from '../agent/tools/index.js';
import { resolveApiKey, resolveModelSettings } from '../config/index.js';
import { toErrorMessage } from '../util/errors.js';
import { log, logError } from '../logger.js';
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
import type { SessionController } from './session-controller.js';
import { setTokenCount } from './terminal-ui.js';

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
  runHumanEvalMenu?(): Promise<void>;
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
    const resultJsonPath = process.env['FREECODE_RESULT_JSON'];

    // Write an initial placeholder entry so the footer shows the correct model
    // immediately rather than waiting for the full agent loop to complete.
    if (resultJsonPath) {
      try {
        const modelStr = runtime.getSelectedModel() ?? '';
        const colonIdx = modelStr.indexOf(':');
        const placeholder = {
          providerId: colonIdx !== -1 ? modelStr.slice(0, colonIdx) : '',
          modelId: colonIdx !== -1 ? modelStr.slice(colonIdx + 1) : modelStr,
          totalTokens: 0,
        };
        const existing: unknown[] = existsSync(resultJsonPath) ? JSON.parse(readFileSync(resultJsonPath, 'utf-8')) as unknown[] : [];
        existing.push(placeholder);
        writeFileSync(resultJsonPath, JSON.stringify(existing, null, 2), 'utf-8');
      } catch (err) {
        logError('eval', 'Failed to write initial result JSON placeholder', err);
      }
    }

    const result = await agentLoop(runtime.session.messages, runtime.projectRoot, runtime.getSelectedModel() ?? undefined, {
      confirmToolCall: runtime.confirmToolCall,
      readOnly: runtime.getReadOnly?.() ?? false,
      onPartialResult: resultJsonPath ? (partial) => {
        // Update the last entry with quota as soon as the first API response arrives.
        if (partial.quota === null) return;
        try {
          const entries = existsSync(resultJsonPath) ? JSON.parse(readFileSync(resultJsonPath, 'utf-8')) as Record<string, unknown>[] : [];
          if (entries.length > 0) {
            entries[entries.length - 1] = { ...entries[entries.length - 1], ...partial, quota: partial.quota };
            writeFileSync(resultJsonPath, JSON.stringify(entries, null, 2), 'utf-8');
          }
        } catch (err) {
          logError('eval', 'Failed to update partial result JSON', err);
        }
      } : undefined,
    });

    if (!result.text.trim()) {
      console.log(chalk.yellow('(empty response from model)'));
    }

    await runtime.onAgentResult?.(result);

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
        // Replace the placeholder entry we wrote before the loop with the full result.
        const existing: unknown[] = existsSync(resultJsonPath) ? JSON.parse(readFileSync(resultJsonPath, 'utf-8')) as unknown[] : [];
        if (existing.length > 0) {
          existing[existing.length - 1] = entry;
        } else {
          existing.push(entry);
        }
        writeFileSync(resultJsonPath, JSON.stringify(existing, null, 2), 'utf-8');
      } catch (err) {
        logError('eval', `Failed to write result JSON to ${resultJsonPath}`, err);
      }
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

  if (normalized === '/humaneval') {
    if (runtime.runHumanEvalMenu) {
      await runtime.runHumanEvalMenu();
    } else {
      console.log(chalk.dim('/humaneval is only available in interactive mode.'));
    }
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
