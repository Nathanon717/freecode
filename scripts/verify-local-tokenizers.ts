#!/usr/bin/env tsx
/**
 * Verifies the *exact* local tokenizers against real provider token accounting.
 *
 * For every selectable free model whose family has an exact local tokenizer
 * backend (gpt-oss, llama-3, deepseek-v3/v4, glm-4 — see
 * src/tokenizers/model-family.ts), it measures how many tokens a fixed sample
 * of text costs, two ways:
 *
 *   - locally, with the model's exact tokenizer, and
 *   - remotely, from the provider's own `usage.promptTokens`,
 *
 * and checks the two agree to the token.
 *
 * NO FALLBACK. countTokens() from src/tokenizers/count.ts is deliberately NOT
 * used here: on the app's hot path it silently degrades to a generic o200k
 * estimate whenever the exact backend isn't loaded, which would make this
 * script "pass" against the estimate instead of the real tokenizer. Since every
 * model we target belongs to an exact-tokenizer family, a tokenizer that can't
 * be loaded (missing / empty / corrupt cache file, failed download) is a hard
 * error we surface loudly (`load-error`, non-zero exit) — never quietly swapped
 * for an approximation.
 *
 * Why a *differential* measurement instead of "tokenize a string and compare to
 * the count in the response":
 *
 *   The provider never reports "tokens for your string". It reports prompt
 *   tokens for the *whole* wire request: BOS/role/turn special tokens, the chat
 *   template, and (for us) the system prompt — none of which a raw string
 *   tokenizer sees. So a direct equality can never hold; it's off by a
 *   per-family constant. Instead we send two requests that are byte-identical
 *   except that the second appends the sample to the first's user message:
 *
 *       anchor           -> promptTokens A
 *       anchor + sample  -> promptTokens B
 *
 *   Everything except the appended sample is identical, so `B - A` is *exactly*
 *   the tokens the sample adds — all template / overhead cancels. We compute the
 *   same delta locally with the exact encoder's countMessages (whose per-message
 *   and system-prompt overhead likewise cancel in the subtraction), so an exact
 *   tokenizer must match the provider to the token, with no fudge factor and no
 *   boundary-merge caveat (both sides measure the same incremental append).
 *
 * Why this is provider-general: we read `result.usage.promptTokens`, which the
 * AI SDK normalizes across providers. The raw number lives in the response
 * *body* (`usage.prompt_tokens` for OpenAI-compatible, `input_tokens` for
 * Anthropic) — not a header, and the header format differs per provider — but
 * the SDK hides that, so this script needs no per-provider header parsing.
 *
 * How much text to send: only the prompt side is measured, and completions are
 * capped at 1 token, so cost per model is ~ (2*anchor + sample) input tokens
 * with the sample sent once. The default sample is a few hundred tokens — big
 * enough that its BPE merges are actually exercised, small enough for the
 * lowest free quotas. Scale it with `--repeat N` for a heavier probe.
 *
 * Usage:
 *   npx tsx scripts/verify-local-tokenizers.ts                      # all live free providers
 *   npx tsx scripts/verify-local-tokenizers.ts --dry-run            # local exact counts only, no API calls
 *   npx tsx scripts/verify-local-tokenizers.ts --repeat 4           # 4x larger sample
 *   npx tsx scripts/verify-local-tokenizers.ts --model gpt-oss-20b  # only models matching this substring
 */
import { writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import type { CoreMessage } from 'ai';
import type { TokenizerEncoder } from '../src/tokenizers/count.js';

// Mirrors src/index.ts's tryInjectDoppler(). Must run before any src module is
// imported, since some provider config reads env vars at module-evaluation time.
function tryInjectDoppler(): void {
  if (process.env['DOPPLER_PROJECT']) return;
  const result = spawnSync('doppler', ['secrets', 'download', '--format=json', '--no-file'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return;
  try {
    const secrets = JSON.parse(result.stdout) as Record<string, string>;
    for (const [key, value] of Object.entries(secrets)) process.env[key] = value;
  } catch {
    // ignore parse errors
  }
}

const PER_CALL_TIMEOUT_MS = 90_000;
const RESULTS_PATH = join(import.meta.dirname, 'local-tokenizer-results.txt');

// A short prefix present in both requests. The sample is appended after it, so
// the provider's per-request template/overhead is identical between the two
// calls and cancels in the delta. Kept tiny to minimize quota use.
const ANCHOR = 'x';

// A single varied block: prose, code, digits, punctuation, and non-ASCII, so
// the sample stress-tests real BPE merges rather than only common English.
// Starts with a newline so it never merges into ANCHOR's last byte on either
// side (and even if it did, both sides would merge identically).
const SAMPLE_UNIT = `
The quick brown fox jumps over 13 lazy dogs — again, and again, and AGAIN.
function fib(n){ return n < 2 ? n : fib(n-1) + fib(n-2); }  // O(2^n), don't ship this
Mixed digits: 3.14159, 0xDEADBEEF, 1_000_000, 2026-07-05T12:00:00Z.
Unicode: café, naïve, Zürich, 日本語, Ελληνικά, 🚀🔥, — em-dash, «guillemets».
snake_case, camelCase, PascalCase, SCREAMING_SNAKE, kebab-case-token.
`;

function parseArgs(): { dryRun: boolean; repeat: number; model: string | null } {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const repeatIdx = argv.indexOf('--repeat');
  const repeat = repeatIdx !== -1 ? Math.max(1, Number(argv[repeatIdx + 1]) || 1) : 1;
  const modelIdx = argv.indexOf('--model');
  const model = modelIdx !== -1 ? (argv[modelIdx + 1] ?? '').trim() || null : null;
  return { dryRun, repeat, model };
}

interface Row {
  modelPref: string;
  family: string;
  localDelta: number | null;
  serverDelta: number | null;
  status: 'match' | 'mismatch' | 'load-error' | 'failed' | 'dry';
  detail: string;
}

// Duck-types the statusCode/responseBody fields on both real AI SDK
// APICallErrors and the plain Error the openai-compat adapter throws.
function describeError(error: unknown): string {
  const e = error as { statusCode?: unknown; responseBody?: unknown };
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : undefined;
  let detail = statusCode !== undefined && !message.includes(`HTTP ${statusCode}`)
    ? `HTTP ${statusCode}: ${message}`
    : message;
  if (typeof e?.responseBody === 'string') {
    const trimmed = e.responseBody.trim().slice(0, 300);
    if (trimmed && !detail.includes(trimmed.slice(0, 50))) detail += ` — body: ${trimmed}`;
  }
  return detail;
}

async function main(): Promise<void> {
  const { dryRun, repeat, model } = parseArgs();
  const sample = SAMPLE_UNIT.repeat(repeat);

  tryInjectDoppler();

  // Dynamic imports so doppler-injected env vars are in place before any
  // provider module evaluates (see comment above).
  const { getSelectableModels } = await import('../src/commands/model.js');
  const { modelPreference } = await import('../src/cli/model-screen.js');
  const { resolveModel, PROVIDER_REGISTRY } = await import('../src/providers/registry.js');
  const { hasExactTokenizer } = await import('../src/tokenizers/count.js');
  const { resolveTokenizerFamily, GPT_OSS_FAMILY, HF_TOKENIZER_REPO } = await import('../src/tokenizers/model-family.js');
  const { loadBpeJsonEncoder } = await import('../src/tokenizers/backends/bpe-json.js');
  const { getGptOssEncoder } = await import('../src/tokenizers/backends/tiktoken.js');
  const { ensureTokenizerFile } = await import('../src/tokenizers/download-tokenizer.js');
  const { generateText } = await import('ai');

  // Load the exact encoder for a family, or THROW. No fallback path: gpt-oss is
  // bundled (never fails); the HF families download-then-parse, and a missing
  // download (null) or an empty/corrupt cache file (loadBpeJsonEncoder throws)
  // surfaces as a hard error rather than a silent o200k estimate. Cached per
  // family so the 19MB glm-4 tokenizer.json is parsed once, not per model.
  const encoderCache = new Map<string, TokenizerEncoder>();
  async function loadExactEncoder(family: string): Promise<TokenizerEncoder> {
    const cached = encoderCache.get(family);
    if (cached) return cached;
    let encoder: TokenizerEncoder;
    if (family === GPT_OSS_FAMILY) {
      encoder = getGptOssEncoder();
    } else {
      const repoId = HF_TOKENIZER_REPO[family];
      if (!repoId) throw new Error(`family "${family}" has no configured HF tokenizer repo`);
      const path = await ensureTokenizerFile(family, repoId);
      if (!path) throw new Error(`could not download tokenizer.json for ${family} (${repoId})`);
      encoder = loadBpeJsonEncoder(path); // throws on an empty/corrupt cache file
    }
    encoderCache.set(family, encoder);
    return encoder;
  }

  // Free providers only: skip anything flagged `paid` in the registry (openai,
  // anthropic). The exact-tokenizer families are all open models on free
  // OpenAI-compatible providers anyway, so this drops nothing we can measure.
  const paidProviderIds = new Set(PROVIDER_REGISTRY.filter(p => p.paid).map(p => p.id));

  const allExact = (await getSelectableModels())
    .filter(item => !paidProviderIds.has(item.providerId))
    .filter(item => hasExactTokenizer(item.modelId));

  // `--model <substr>` narrows to a single model (or a handful): case-insensitive
  // substring match against the "provider:modelId" preference, the same string
  // the results table prints, so you can copy one straight back in.
  const needle = model?.toLowerCase();
  const items = needle
    ? allExact.filter(item => modelPreference(item).toLowerCase().includes(needle))
    : allExact;

  if (items.length === 0) {
    if (needle && allExact.length > 0) {
      console.error(`No exact-tokenizer model matches --model "${model}". Available:`);
      for (const item of allExact) console.error(`  ${modelPreference(item)}`);
    } else {
      console.error('No selectable free models with an exact local tokenizer found.');
      console.error('(Need configured free-provider API keys; see /keys in the app.)');
    }
    process.exitCode = 1;
    return;
  }

  const delta = (enc: TokenizerEncoder, base: string, withSample: string): number => {
    const msgs = (content: string): CoreMessage[] => [{ role: 'user', content }];
    return enc.countMessages(msgs(withSample)) - enc.countMessages(msgs(base));
  };

  const rows: Row[] = [];
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const modelPref = modelPreference(item);
    const family = resolveTokenizerFamily(item.modelId) ?? '?';

    // Load the exact encoder — loudly. A family member with an unloadable
    // tokenizer is a hard error, never a fallback measurement.
    let localDelta: number;
    try {
      const encoder = await loadExactEncoder(family);
      localDelta = delta(encoder, ANCHOR, ANCHOR + sample);
    } catch (error) {
      rows.push({ modelPref, family, localDelta: null, serverDelta: null, status: 'load-error', detail: `EXACT TOKENIZER FAILED TO LOAD: ${describeError(error)}` });
      console.log(`[${i + 1}/${total}] ${modelPref} — family=${family} !! EXACT TOKENIZER FAILED TO LOAD: ${describeError(error)}`);
      process.exitCode = 1;
      continue;
    }

    if (dryRun) {
      rows.push({ modelPref, family, localDelta, serverDelta: null, status: 'dry', detail: 'dry-run (no API call)' });
      console.log(`[${i + 1}/${total}] ${modelPref} — family=${family} localΔ=${localDelta} (dry-run)`);
      continue;
    }

    process.stdout.write(`[${i + 1}/${total}] ${modelPref} — family=${family} localΔ=${localDelta} … `);

    try {
      const { model } = resolveModel(modelPref);
      const call = (content: string) => generateText({
        model,
        messages: [{ role: 'user', content }],
        maxTokens: 1,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
      });
      // Sequential, not parallel: the shared anchor request first, then the
      // sample request, so a rate-limited provider doesn't reject the pair.
      const a = await call(ANCHOR);
      const b = await call(ANCHOR + sample);
      const ptA = a.usage.promptTokens;
      const ptB = b.usage.promptTokens;

      if (typeof ptA !== 'number' || typeof ptB !== 'number') {
        rows.push({ modelPref, family, localDelta, serverDelta: null, status: 'failed', detail: 'provider returned no promptTokens' });
        console.log('no usage');
        continue;
      }

      const serverDelta = ptB - ptA;
      const match = serverDelta === localDelta;
      rows.push({
        modelPref, family, localDelta, serverDelta,
        status: match ? 'match' : 'mismatch',
        detail: match ? 'exact' : `off by ${serverDelta - localDelta} (server ${serverDelta} vs local ${localDelta})`,
      });
      console.log(match ? `MATCH (${serverDelta})` : `MISMATCH server=${serverDelta} local=${localDelta}`);
    } catch (error) {
      rows.push({ modelPref, family, localDelta, serverDelta: null, status: 'failed', detail: describeError(error) });
      console.log(`failed: ${describeError(error)}`);
    }
  }

  const matched = rows.filter(r => r.status === 'match').length;
  const measured = rows.filter(r => r.status === 'match' || r.status === 'mismatch').length;
  const loadErrors = rows.filter(r => r.status === 'load-error');
  const scope = `repeat=${repeat}${model ? `, model~${model}` : ''}`;
  const header = dryRun
    ? `Dry run — ${total} exact-tokenizer models (${scope})`
    : `${matched}/${measured} measured models matched their provider exactly (${total} targeted, ${scope})`;

  const lines = [
    header,
    ...(loadErrors.length ? [`!! ${loadErrors.length} exact tokenizer(s) failed to load: ${[...new Set(loadErrors.map(r => r.family))].join(', ')}`] : []),
    '',
    ...rows.map(r => [r.modelPref, r.family, `local=${r.localDelta}`, r.serverDelta === null ? 'server=-' : `server=${r.serverDelta}`, r.status, r.detail].join('\t')),
  ];
  writeFileSync(RESULTS_PATH, lines.join('\n') + '\n');
  console.log(`\n${header}`);
  if (loadErrors.length) console.log(`!! ${loadErrors.length} exact tokenizer(s) failed to load — see results (exit 1).`);
  console.log(`Results written to ${RESULTS_PATH}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
