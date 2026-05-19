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
import { getOllamaModels } from './providers/ollama.js';
import { route, testAllProviders } from './providers/router.js';

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
  if (config.useOllama) {
    log('ollama', 'Probing Ollama');
    await getOllamaModels();
  }

  if (args.includes('--test-all')) {
    await testAll();
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

  try {
    const probe = await route([], selectedModel ?? undefined);
    log('router', `Startup probe OK -> ${probe.providerId}:${probe.modelId}`);
  } catch (err) {
    log('router', 'Startup probe failed - no providers available', { error: err instanceof Error ? err.message : String(err) });
    console.log(chalk.yellow('No providers available. Use /model to configure.\n'));
  }

  session.createSession();

  if (process.stdin.isTTY) setupBottomUI();
  await runCliSession({
    projectRoot,
    session,
    getSelectedModel: () => selectedModel,
    setSelectedModel: (model) => { selectedModel = model; },
    mode: createInteractiveMode(rl, projectRoot, session),
  });
  rl.close();
}

async function testSingle() {
  console.log(chalk.blue('Testing freecode...\n'));

  try {
    const { providerId, modelId } = await route();
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
  } catch (error) {
    if (error instanceof Error) {
      console.log(chalk.red(`Error: ${error.message}`));
    } else {
      console.log(chalk.red('Unknown error'));
    }
  }
}

async function testAll() {
  console.log(chalk.blue('Testing all providers...\n'));

  const results = await testAllProviders();

  for (const status of results) {
    const statusColor = status.ok ? chalk.green : chalk.red;
    const statusIcon = status.ok ? 'OK' : 'FAIL';

    console.log(statusColor(`[${statusIcon}] ${status.providerName}`));

    if (status.ok) {
      console.log(chalk.gray(`    Provider ID: ${status.providerId}`));
    } else {
      console.log(chalk.red(`    Error: ${status.error}`));
    }

    console.log('');
  }

  const working = results.filter((r) => r.ok).length;
  const total = results.length;

  console.log(chalk.blue(`${working}/${total} providers available`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
