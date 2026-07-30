#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import chalk from 'chalk';
import { FREE_ONLY_ENV_VAR, isFreeOnlyMode, isPaidApiKeyEnvVar } from './providers/paid-guard.js';

function tryInjectDoppler(): void {
  if (process.env['DOPPLER_PROJECT']) return;
  const result = spawnSync(
    'doppler',
    ['secrets', 'download', '--project', 'freecode', '--config', 'dev', '--format=json', '--no-file'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (result.error || result.status !== 0) return;
  const freeOnly = isFreeOnlyMode();
  try {
    const secrets = JSON.parse(result.stdout) as Record<string, string>;
    for (const [key, value] of Object.entries(secrets)) {
      // Never let a billable credential into the process in free-only mode. Doing
      // it here rather than deleting after injection is the point: a later reader
      // cannot race it, and `/status` and the picker see the same truth.
      if (freeOnly && isPaidApiKeyEnvVar(key)) continue;
      process.env[key] = value;
    }
  } catch {
    // ignore parse errors
  }
}

// Argv -> env, before injection: `-p` is a headless mode meant for LLM callers, so
// it is always free-only. The guard reads env alone (it runs before argv parsing
// in main), so the entry point is what translates the flag.
if (process.argv.slice(2).includes('-p')) {
  process.env[FREE_ONLY_ENV_VAR] = '1';
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

  const promptIdx = args.indexOf('-p');
  if (promptIdx !== -1) {
    if (!args[promptIdx + 1]) {
      console.error('Error: -p requires a prompt argument');
      process.exitCode = 1;
      return;
    }
    if (args.includes('--script')) {
      console.error('Error: -p and --script are different session modes; pass one');
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
  const { showBanner } = await import('./cli/render/banner.js');
  const { createInteractiveMode } = await import('./cli/session-modes.js');
  const { createScriptedMode } = await import('./cli/scripted-mode.js');
  const { Conversation } = await import('./agent/conversation.js');
  const { runCliSession } = await import('./cli/session-runner.js');
  const { setupFooterUI } = await import('./cli/chrome/bottom-ui.js');
  const { setRetryBanner, setQuotaSnapshot } = await import('./cli/chrome/footer-status.js');
  const { registerQuotaUpdateSink } = await import('./providers/adapters/openai-compat.js');
  const { registerRetryBannerSink } = await import('./providers/adapters/adapter-http-retry.js');
  const { createStdoutRetrySink } = await import('./cli/stdout-retry-sink.js');
  const { loadConfig } = await import('./config/index.js');
  const { enableLog } = await import('./logger.js');
  const { primeConfigCacheFromFile, drainPendingWrites } = await import('./store/db.js');

  installScreenBuffer();

  // Default retry-banner rendering for non-TTY sessions. The TTY footer and the
  // scripted retry-status-file writer below override this when they apply.
  registerRetryBannerSink(createStdoutRetrySink());

  // freecode renders its own bottom UI and only uses readline for rl.question
  // (menus/approval). Node's readline installs its own 'resize' listener that
  // refreshes the line editor even while paused — emitting a stray `> ` prompt and
  // an `\x1b[0J` erase across the reflowed transcript on every resize. freecode's
  // own resize handler is already registered (bottom-ui imported above), so diff
  // the listener set and drop only the one readline just added.
  const resizeListenersBefore = process.stdout.listeners('resize');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (const listener of process.stdout.listeners('resize')) {
    if (!resizeListenersBefore.includes(listener)) {
      process.stdout.removeListener('resize', listener as () => void);
    }
  }
  const projectRoot = process.cwd();
  const session = new Conversation(projectRoot);
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

  if (promptIdx !== -1) {
    const { runHeadlessPrompt } = await import('./cli/headless-prompt.js');
    process.exitCode = await runHeadlessPrompt({
      projectRoot,
      prompt: args[promptIdx + 1],
      model: selectedModel,
    });
    await drainPendingWrites();
    rl.close();
    return;
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
      mode = createScriptedMode(scriptPath);
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

  showBanner();

  if (process.stdin.isTTY) {
    setupFooterUI();
    registerRetryBannerSink(setRetryBanner);
    registerQuotaUpdateSink(setQuotaSnapshot);
  }

  // Warm model lists and pricing in background so /model opens instantly.
  if (process.stdin.isTTY && process.env.FREECODE_NO_PREFETCH !== '1') {
    import('./commands/model.js')
      .then(({ getSelectableModels }) => getSelectableModels())
      .catch(() => {});
  }

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
