#!/usr/bin/env node

import { createInterface } from 'readline';
import chalk from 'chalk';
import { agentLoop } from './agent/loop.js';
import { showBanner } from './cli/banner.js';
import { createInteractiveMode, createScriptedMode, denyToolCallWithPreview } from './cli/input-modes.js';
import { SessionController } from './cli/session-controller.js';
import { runCliSession } from './cli/session-runner.js';
import { setupBottomUI } from './cli/terminal-ui.js';
import { loadConfig } from './config/index.js';
import { enableLog, log } from './logger.js';
import {
  addAnthropicSessionCost,
  describeCostEstimate,
  describeCostEstimateBreakdown,
  formatUsdCeil,
} from './providers/anthropic-cost.js';
import { addOpenAISessionCost } from './providers/openai-cost.js';
import { formatCapturedProviderUsages } from './providers/adapters/openai-compat.js';
import { PROVIDER_REGISTRY, resolveModel } from './providers/registry.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const projectRoot = process.cwd();

const session = new SessionController(projectRoot);
let selectedModel = '';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-log')) {
    enableLog();
  }

  const config = loadConfig();
  selectedModel = config.defaultModel ?? '';

  if (args.includes('--test-all')) {
    testAll();
    rl.close();
    return;
  }

  if (args.includes('--test')) {
    await testSingle();
    rl.close();
    return;
  }

  const scriptIdx = args.indexOf('--script');
  if (scriptIdx !== -1) {
    const scriptPath = args[scriptIdx + 1];
    if (!scriptPath) {
      console.error('Error: --script requires a file path argument');
      process.exitCode = 1;
      rl.close();
      return;
    }

    session.createSession();
    let mode;
    try {
      mode = createScriptedMode(scriptPath, projectRoot);
    } catch {
      console.error(`Error reading script file: ${scriptPath}`);
      process.exitCode = 1;
      rl.close();
      return;
    }
    await runCliSession({
      projectRoot,
      session,
      getSelectedModel: () => selectedModel,
      setSelectedModel: (model) => { selectedModel = model; },
      mode,
    });
    rl.close();
    return;
  }

  showBanner();

  if (!selectedModel) {
    console.log(chalk.yellow('No model selected. Use /model to choose one.\n'));
  }

  session.createSession();

  if (process.stdin.isTTY) setupBottomUI();
  await runCliSession({
    projectRoot,
    session,
    getSelectedModel: () => selectedModel,
    setSelectedModel: (model) => { selectedModel = model; },
    mode: createInteractiveMode(
      rl,
      projectRoot,
      session,
      () => selectedModel,
      (model) => { selectedModel = model; },
    ),
  });
  rl.close();
}

async function testSingle() {
  console.log(chalk.blue('Testing freecode...\n'));

  if (!selectedModel) {
    console.log(chalk.red('No model configured. Set a default with /model (press Space).'));
    return;
  }

  try {
    const { providerId, modelId } = resolveModel(selectedModel);
    console.log(chalk.green(`Selected provider: ${providerId}`));
    console.log(chalk.green(`Selected model: ${modelId}\n`));

    session.addUserMessage('Say "freecode is alive" and nothing else.');

    const result = await agentLoop(session.messages, projectRoot, undefined, {
      confirmToolCall: denyToolCallWithPreview,
    });

    console.log(chalk.bold('Response:'));
    console.log(result.text);
    console.log();
    console.log(chalk.gray(`Tokens used: ${result.usage.totalTokens} | using ${result.providerId}:${result.modelId}`));
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
    if (providerUsage) {
      console.log(chalk.gray('Provider usage:'));
      console.log(chalk.gray(providerUsage));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    } else {
      console.log(chalk.red('Unknown error'));
    }
  }
}

function testAll() {
  console.log(chalk.blue('Provider key status:\n'));

  const config = loadConfig();
  let configured = 0;

  for (const provider of PROVIDER_REGISTRY) {
    const apiKey = process.env[provider.apiKeyEnvVar] || config.providers[provider.id]?.apiKey;
    if (apiKey) {
      console.log(chalk.green(`[OK]   ${provider.name}`) + chalk.gray(` (${provider.id})`));
      configured++;
    } else {
      console.log(chalk.dim(`[    ] ${provider.name}`) + chalk.gray(` (${provider.id})`));
    }
  }

  console.log('');
  console.log(chalk.blue(`${configured}/${PROVIDER_REGISTRY.length} providers configured`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
