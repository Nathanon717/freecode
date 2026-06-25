#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
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

async function main() {
  const args = process.argv.slice(2);

  // Validate args before loading the heavy module graph (ai SDK).
  // libSQL is deferred to the first store-consuming action — it never loads on early-exit paths.
  // Early exits here keep --model/--script error paths under ~200ms.
  // Do NOT reference `rl` here — it is created after the imports below.
  const modelIdx = args.indexOf('--model');
  if (modelIdx !== -1) {
    const modelPreference = args[modelIdx + 1];
    if (!modelPreference) {
      console.error('Error: --model requires a provider:model argument');
      process.exitCode = 1;
      return;
    }
  }

  const scriptIdx = args.indexOf('--script');
  if (scriptIdx !== -1) {
    const scriptPath = args[scriptIdx + 1];
    if (!scriptPath) {
      console.error('Error: --script requires a file path argument');
      process.exitCode = 1;
      return;
    }
    try {
      readFileSync(scriptPath);
    } catch {
      console.error(`Error reading script file: ${scriptPath}`);
      process.exitCode = 1;
      return;
    }
  }

  // Load heavy modules only after validation passes.
  const { createInterface } = await import('readline');
  const { installScreenBuffer } = await import('./util/screen-buffer.js');
  const { showBanner } = await import('./cli/banner.js');
  const { createInteractiveMode, createScriptedMode } = await import('./cli/session-modes.js');
  const { SessionController } = await import('./agent/session-controller.js');
  const { runCliSession } = await import('./cli/session-runner.js');
  const { setupFooterUI, setRetryBanner, setQuotaSnapshot } = await import('./cli/terminal-ui.js');
  const { registerQuotaUpdateSink } = await import('./providers/adapters/openai-compat.js');
  const { registerRetryBannerSink } = await import('./providers/adapters/adapter-http-retry.js');
  const { createStdoutRetrySink } = await import('./cli/stdout-retry-sink.js');
  const { loadConfig } = await import('./config/index.js');
  const { enableLog } = await import('./logger.js');
  const { primeConfigCacheFromFile, drainPendingWrites } = await import('./providers/db.js');

  installScreenBuffer();

  // Default retry-banner rendering for non-TTY sessions. The TTY footer and the
  // scripted retry-status-file writer below override this when they apply.
  registerRetryBannerSink(createStdoutRetrySink());

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const projectRoot = process.cwd();
  const session = new SessionController(projectRoot);
  let selectedModel = '';

  if (args.includes('-log')) {
    enableLog();
  }

  // libSQL is now deferred like `ai` — boot primes the config cache from the
  // file mirror (sync, no native-addon load); real DB loads lazily on the first
  // store-consuming action (model picker, /config, agent loop, etc.) via ensureStoreReady().
  primeConfigCacheFromFile();

  const config = loadConfig();
  selectedModel = process.env['FREECODE_MODEL'] ?? config.defaultModel ?? '';

  if (modelIdx !== -1) {
    selectedModel = args[modelIdx + 1];
  }

  if (scriptIdx !== -1) {
    const scriptPath = args[scriptIdx + 1];

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
