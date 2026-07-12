#!/usr/bin/env tsx
/**
 * Sends the single message "hi" (no system prompt, no tools, no history) to every
 * model in the exact list the in-app /model picker shows, one HTTP call per model,
 * and records success/failure to a results file.
 *
 * The model list comes from `getSelectableModels()` (src/commands/model.ts) — the
 * same function the picker and the startup prefetch call — so filtering here is
 * identical to the app's, not reimplemented.
 *
 * Usage: npm run test-all-models
 */
import { writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

// Mirrors src/index.ts's tryInjectDoppler(). Must run before any src module is
// imported, since some provider config (e.g. Cloudflare's baseUrl) reads env
// vars at module-evaluation time.
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

const PER_MODEL_TIMEOUT_MS = 90_000;
const RESULTS_PATH = join(import.meta.dirname, 'model-availability-results.txt');

interface Outcome {
  modelPref: string;
  status: 'works' | 'failed';
  detail: string;
  durationMs: number;
}

// Duck-types the statusCode/responseBody fields present on both real AI SDK
// APICallErrors (anthropic path) and the plain Error the openai-compat adapter
// throws via Object.assign(new Error(...), { statusCode }) (adapter-http-retry.ts).
function describeError(error: unknown): string {
  const e = error as { statusCode?: unknown; responseBody?: unknown };
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : undefined;
  let detail = statusCode !== undefined && !message.includes(`HTTP ${statusCode}`)
    ? `HTTP ${statusCode}: ${message}`
    : message;
  if (typeof e?.responseBody === 'string') {
    const trimmed = e.responseBody.trim().slice(0, 1000);
    if (trimmed && !detail.includes(trimmed.slice(0, 50))) detail += ` — body: ${trimmed}`;
  }
  return detail;
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  tryInjectDoppler();

  // Dynamic imports so the doppler-injected env vars are in place before any
  // provider module evaluates (see comment above).
  const { getSelectableModels } = await import('../src/commands/model.js');
  const { modelPreference } = await import('../src/cli/model-screen.js');
  const { resolveModel, PROVIDER_REGISTRY } = await import('../src/providers/provider-registry.js');
  const { streamText } = await import('ai');

  // Free models only: skip providers flagged `paid: true` in the registry
  // (currently openai and anthropic). This is an explicit filter on top of the
  // app's own selectable-model list, not a reimplementation of it.
  const paidProviderIds = new Set(PROVIDER_REGISTRY.filter(p => p.paid).map(p => p.id));

  const items = (await getSelectableModels()).filter(item => !paidProviderIds.has(item.providerId));
  const prefs = items.map(modelPreference);
  const total = prefs.length;

  if (total === 0) {
    console.error('No selectable models found (no configured providers/API keys).');
    process.exitCode = 1;
    return;
  }

  const outcomes: Outcome[] = [];
  const isTTY = process.stdout.isTTY === true;

  for (let i = 0; i < total; i++) {
    const modelPref = prefs[i];
    const startedAt = Date.now();
    let timer: ReturnType<typeof setInterval> | undefined;

    if (isTTY) {
      const render = (): void => {
        const elapsed = formatElapsed(Date.now() - startedAt);
        process.stdout.write(`\r\x1b[K[${i + 1}/${total}] ${modelPref} — ${elapsed}`);
      };
      render();
      timer = setInterval(render, 1000);
    } else {
      console.log(`[${i + 1}/${total}] ${modelPref} — starting`);
    }

    let status: Outcome['status'];
    let detail: string;
    try {
      const { model } = resolveModel(modelPref);
      const result = await streamText({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(PER_MODEL_TIMEOUT_MS),
      });
      // Errors surface on consumption, not at the call site — must drain the
      // stream inside the try/catch or failures go unnoticed.
      for await (const _chunk of result.textStream) {
        // discard content; only success/failure matters
      }
      const text = await result.text;
      status = 'works';
      detail = text.trim() || '(empty response)';
    } catch (error) {
      status = 'failed';
      detail = describeError(error);
    }

    if (timer) clearInterval(timer);
    const durationMs = Date.now() - startedAt;
    outcomes.push({ modelPref, status, detail, durationMs });

    const line = `[${i + 1}/${total}] ${modelPref} — ${status === 'works' ? 'works' : 'failed'} (${formatElapsed(durationMs)})`;
    if (isTTY) {
      process.stdout.write(`\r\x1b[K${line}\n`);
    } else {
      console.log(line);
    }
  }

  const succeeded = outcomes.filter(o => o.status === 'works').length;
  const lines = [
    `${succeeded}/${total} models succeeded`,
    '',
    ...outcomes.flatMap(o => [o.modelPref, `${o.detail} (${formatElapsed(o.durationMs)})`, '']),
  ];
  writeFileSync(RESULTS_PATH, lines.join('\n') + '\n');
  console.log(`\nResults written to ${RESULTS_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
