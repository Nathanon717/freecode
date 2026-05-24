#!/usr/bin/env node

import { createInterface } from 'readline';
import chalk from 'chalk';
import { showBanner } from './cli/banner.js';
import { createInteractiveMode, createScriptedMode } from './cli/input-modes.js';
import { SessionController } from './cli/session-controller.js';
import { runCliSession } from './cli/session-runner.js';
import { setupBottomUI } from './cli/terminal-ui.js';
import { loadConfig } from './config/index.js';
import { enableLog } from './logger.js';

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
  selectedModel = process.env['FREECODE_MODEL'] ?? config.defaultModel ?? '';

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
