#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync } from 'fs';
import { createInterface } from 'readline';
import chalk from 'chalk';

function tryInjectDoppler(): void {
  if (process.env['DOPPLER_PROJECT']) return;
  const result = spawnSync('doppler', ['secrets', 'download', '--format=json', '--no-file'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return;
  try {
    const secrets = JSON.parse(result.stdout) as Record<string, string>;
    for (const [key, value] of Object.entries(secrets)) {
      process.env[key] = value;
    }
  } catch {
    // ignore parse errors
  }
}

tryInjectDoppler();
import { installScreenBuffer } from './util/screen-buffer.js';
import { showBanner } from './cli/banner.js';
import { createInteractiveMode, createScriptedMode } from './cli/input-modes.js';
import { SessionController } from './cli/session-controller.js';
import { runCliSession } from './cli/session-runner.js';
import { setupFooterUI, setRetryBanner, setQuotaSnapshot } from './cli/terminal-ui.js';
import { registerRetryBannerSink, registerQuotaUpdateSink } from './providers/adapters/openai-compat.js';
import { loadConfig } from './config/index.js';
import { enableLog } from './logger.js';
import { initStore, drainPendingWrites } from './providers/db.js';

installScreenBuffer();

const rl = createInterface({ input: process.stdin, output: process.stdout });
const projectRoot = process.cwd();

const session = new SessionController(projectRoot);
let selectedModel = '';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('-log')) {
    enableLog();
  }

  await initStore();

  const config = loadConfig();
  selectedModel = process.env['FREECODE_MODEL'] ?? config.defaultModel ?? '';
  const modelIdx = args.indexOf('--model');
  if (modelIdx !== -1) {
    const modelPreference = args[modelIdx + 1];
    if (!modelPreference) {
      console.error('Error: --model requires a provider:model argument');
      process.exitCode = 1;
      rl.close();
      return;
    }
    selectedModel = modelPreference;
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

    const retryStatusFile = process.env['FREECODE_RETRY_STATUS_FILE'];
    if (retryStatusFile) {
      registerRetryBannerSink(info => {
        try { writeFileSync(retryStatusFile, JSON.stringify(info)); } catch (err) { process.stderr.write(`[freecode] retry status write failed: ${String(err)}\n`); }
      });
    }

    let mode;
    try {
      mode = createScriptedMode(scriptPath, projectRoot, rl);
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
    await drainPendingWrites();
    rl.close();
    return;
  }

  if (process.stdin.isTTY) {
    // Route tool-call transcript to stdout so it appears in the same stream as
    // response text — matching /renderer and the eval subprocess (FREECODE_TRANSCRIPT_STREAM=stdout).
    process.env["FREECODE_TRANSCRIPT_STREAM"] = "stdout";
    setupFooterUI();
    registerRetryBannerSink(setRetryBanner);
    registerQuotaUpdateSink(setQuotaSnapshot);
  }

  showBanner();

  if (!selectedModel) {
    console.log(chalk.yellow('No model selected. Use /model to choose one.\n'));
  }

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
  await drainPendingWrites();
  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
