#!/usr/bin/env tsx
/**
 * Verifies the *exact* local tokenizers against real provider token accounting.
 *
 * For every selectable free model whose family has an exact local tokenizer
 * backend (gpt-oss, llama-3, deepseek-v3/v4, glm-4, mistral-tekken — see
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
 * ---------------------------------------------------------------------------
 * `--probe` inverts the question. Verify mode asks "does this model's *known*
 * family count like the provider?"; probe mode asks "this model has *no* known
 * family — does it count like one anyway?" It targets the models
 * `resolveTokenizerFamily` returns null for (anonymized/codenamed models like
 * `zen:big-pickle`, and genuinely unmapped ones), measures the same server
 * delta, and compares it against the local delta of *every* known family.
 *
 * The discriminator is the same subtraction, so the same "no fudge factor"
 * property holds. What probe mode adds:
 *
 *   - Several distinct sample blocks (ASCII/code, multilingual, symbolic),
 *     not one. Families collide on any single sample — gpt-oss, llama-3 and
 *     glm-4 all charge 157 for the ASCII block — and only separate across a
 *     varied set. A family is only reported as a match if it matches on
 *     *every* sample; one agreeing sample is a coincidence, not an identity.
 *   - `--rounds N` repeats the whole measurement. Some providers (zen) load
 *     balance across upstreams, so an unstable server delta is a routing
 *     artifact, not a tokenizer signal, and is reported as `unstable` rather
 *     than scored.
 *   - A reported margin: how many tokens separated the winner from the nearest
 *     non-matching family. A match with a 1-token margin is not a result.
 *
 * `--probe --dry-run` prints the separation matrix and makes no API calls. Run
 * it first: it is the free go/no-go for the whole method, and it is where
 * indistinguishable family pairs declare themselves. DeepSeek V3 and V4 are one
 * such pair — they ship a byte-identical BPE (same vocab, merges, pre-tokenizer
 * and post-processor; V4 only appends special tokens), so no probe can ever
 * separate them and both are reported together.
 *
 * Usage:
 *   npx tsx scripts/diagnostics/verify-local-tokenizers.ts                     # all live free providers
 *   npx tsx scripts/diagnostics/verify-local-tokenizers.ts--dry-run            # local exact counts only, no API calls
 *   npx tsx scripts/diagnostics/verify-local-tokenizers.ts--repeat 4           # 4x larger sample
 *   npx tsx scripts/diagnostics/verify-local-tokenizers.ts--model gpt-oss-20b  # only models matching this substring
 *   npx tsx scripts/diagnostics/verify-local-tokenizers.ts--probe --dry-run    # separation matrix, no API calls
 *   npx tsx scripts/diagnostics/verify-local-tokenizers.ts--probe              # identify every unmapped free model
 *   npx tsx scripts/diagnostics/verify-local-tokenizers.ts--probe --rounds 3   # 3 rounds, for a load-balancing provider
 */
import { writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import type { CoreMessage } from 'ai';
import type { TokenizerEncoder } from '../../src/tokenizers/count.js';

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
const PROBE_RESULTS_PATH = join(import.meta.dirname, 'tokenizer-family-probe.txt');

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

// Probe mode's samples. Deliberately three *unlike* blocks rather than one long
// one: families are separated by where their vocabs disagree, and a single
// register can't expose that. The ASCII block alone gives gpt-oss, llama-3 and
// glm-4 the identical count of 157; the multilingual block spreads those same
// three across 154/180/204. Every distinguishable pair separates by >=14 tokens
// on at least one block here (see `--probe --dry-run` for the live matrix).
const PROBE_SAMPLES: Record<string, string> = {
  // English prose, TypeScript/JS source, and the number/identifier shapes every
  // code-trained vocab has merges for.
  ascii: `
The quick brown fox jumps over 13 lazy dogs — again, and again, and AGAIN.
function fib(n){ return n < 2 ? n : fib(n-1) + fib(n-2); }  // O(2^n), don't ship this
Mixed digits: 3.14159, 0xDEADBEEF, 1_000_000, 2026-07-05T12:00:00Z.
snake_case, camelCase, PascalCase, SCREAMING_SNAKE, kebab-case-token.
export async function handler(req: Request): Promise<Response> {
  const { id } = await req.json();
  return new Response(JSON.stringify({ ok: true, id }), { status: 200 });
}
`,
  // Six scripts. This is the strongest single discriminator: how much of its
  // vocab a model spent on non-Latin text is the clearest fingerprint of who
  // trained it (glm-4 charges 204 here where gpt-oss charges 154).
  multilingual: `
नमस्ते दुनिया, यह टोकनाइज़र का परीक्षण करने के लिए हिंदी पाठ है।
中文分词测试：北京市海淀区中关村软件园。深度学习模型的训练与推理过程非常复杂。
日本語のテキストをここに書きます。東京都渋谷区の天気は晴れです。機械学習と自然言語処理。
한국어 텍스트 토크나이저 테스트입니다. 서울특별시 강남구 테헤란로에 있습니다.
Привет мир, это тестовый текст на русском языке для проверки токенизатора.
مرحبا بالعالم، هذا نص تجريبي باللغة العربية لاختبار المحلل اللغوي.
`,
  // Emoji (including ZWJ sequences), LaTeX, long digit runs, typographic
  // punctuation and a URL — the byte-fallback corners where vocabs differ most.
  symbolic: `
🚀🔥💡🎉🧠🌍🐍☕️🛠️📦🔒🎯🥇🍕🚗🏔️👩‍💻👨‍👩‍👧‍👦🏳️‍🌈
\\begin{equation}\\sum_{i=0}^{n}\\frac{x_i^2}{\\sigma}\\alpha\\beta\\gamma\\end{equation}
0123456789 3.14159265358979 1234567890987654321 0xDEADBEEF 1e-9 192.168.0.1
«guillemets» —em— –en– …ellipsis… “curly” ‘single’ †‡§¶©®™ ±≠≤≥∞∫∂
https://huggingface.co/deepseek-ai/DeepSeek-V3/resolve/main/tokenizer.json?download=true
`,
};

// Tie-breaker, measured only when the three samples above leave two or more
// families tied. Ordinary text can't separate families whose *base* BPE is
// identical — DeepSeek V3 and V4 share vocab, merges and pre-tokenizer exactly,
// and differ only in `added_tokens` (V4 appends 465, ids 128815-129279). Those
// added tokens are live during encoding, so writing their literal strings is the
// one thing that does separate them: `<think>` costs 3 tokens under V3 and 1
// under V4. Repeated to turn a 2-token-per-instance difference into a wide
// margin. Skipped automatically when it doesn't separate the tied families.
const TIEBREAK_SAMPLE = '\n' + '<think> </think> <｜begin▁of▁file｜> ｜DSML｜ '.repeat(25);

interface Args {
  dryRun: boolean;
  repeat: number;
  model: string | null;
  probe: boolean;
  rounds: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const probe = argv.includes('--probe');
  const repeatIdx = argv.indexOf('--repeat');
  const repeat = repeatIdx !== -1 ? Math.max(1, Number(argv[repeatIdx + 1]) || 1) : 1;
  const roundsIdx = argv.indexOf('--rounds');
  const rounds = roundsIdx !== -1 ? Math.max(1, Number(argv[roundsIdx + 1]) || 1) : 1;
  const modelIdx = argv.indexOf('--model');
  const model = modelIdx !== -1 ? (argv[modelIdx + 1] ?? '').trim() || null : null;
  return { dryRun, repeat, model, probe, rounds };
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
  const { dryRun, repeat, model, probe, rounds } = parseArgs();
  const sample = SAMPLE_UNIT.repeat(repeat);

  tryInjectDoppler();

  // Dynamic imports so doppler-injected env vars are in place before any
  // provider module evaluates (see comment above).
  const { getSelectableModels } = await import('../../src/commands/model.js');
  const { modelPreference } = await import('../../src/cli/menus/model-screen.js');
  const { resolveModel, PROVIDER_REGISTRY } = await import('../../src/providers/provider-registry.js');
  const { hasExactTokenizer } = await import('../../src/tokenizers/count.js');
  const { resolveTokenizerFamily, GPT_OSS_FAMILY, HF_TOKENIZER_REPO, MISTRAL_TEKKEN_FAMILY, MISTRAL_TEKKEN_REPO, TEKKEN_FILENAME } = await import('../../src/tokenizers/model-family.js');
  // Every family with an exact backend, i.e. every candidate identity a probed
  // model can be scored against: the HF fast-tokenizer families plus the two
  // that load from elsewhere (gpt-oss is bundled, tekken fetches tekken.json).
  const ALL_FAMILIES = [GPT_OSS_FAMILY, ...Object.keys(HF_TOKENIZER_REPO), MISTRAL_TEKKEN_FAMILY];
  const { loadBpeJsonEncoder } = await import('../../src/tokenizers/backends/bpe-json.js');
  const { loadTekkenEncoder } = await import('../../src/tokenizers/backends/tekken.js');
  const { getGptOssEncoder } = await import('../../src/tokenizers/backends/tiktoken.js');
  const { ensureTokenizerFile } = await import('../../src/tokenizers/download-tokenizer.js');
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
    } else if (family === MISTRAL_TEKKEN_FAMILY) {
      // Tekken fetches tekken.json (not tokenizer.json) from one shared repo and
      // parses it through backends/tekken.ts — same never-fallback contract: a
      // missing download or unparseable file is a hard error, not an estimate.
      const path = await ensureTokenizerFile(family, MISTRAL_TEKKEN_REPO, TEKKEN_FILENAME);
      if (!path) throw new Error(`could not download ${TEKKEN_FILENAME} for ${family} (${MISTRAL_TEKKEN_REPO})`);
      encoder = loadTekkenEncoder(path); // throws on an empty/corrupt cache file
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

  // Verify mode targets models whose family IS known; probe mode targets exactly
  // the complement — the ones it isn't. `--model` can override the probe filter
  // so a *known* model can be pushed through the probe as a positive control
  // ("does the probe recover the family we already know it has?").
  const free = (await getSelectableModels()).filter(item => !paidProviderIds.has(item.providerId));
  const allTargets = probe
    ? free.filter(item => !hasExactTokenizer(item.modelId) || model !== null)
    : free.filter(item => hasExactTokenizer(item.modelId));

  // `--model <substr>` narrows to a single model (or a handful): case-insensitive
  // substring match against the "provider:modelId" preference, the same string
  // the results table prints, so you can copy one straight back in.
  const needle = model?.toLowerCase();
  const items = needle
    ? allTargets.filter(item => modelPreference(item).toLowerCase().includes(needle))
    : allTargets;

  const kind = probe ? 'unmapped' : 'exact-tokenizer';
  if (items.length === 0 && !(probe && dryRun)) {
    if (needle && allTargets.length > 0) {
      console.error(`No ${kind} model matches --model "${model}". Available:`);
      for (const item of allTargets) console.error(`  ${modelPreference(item)}`);
    } else {
      console.error(`No selectable free ${kind} models found.`);
      console.error('(Need configured free-provider API keys; see /keys in the app.)');
    }
    process.exitCode = 1;
    return;
  }

  const delta = (enc: TokenizerEncoder, base: string, withSample: string): number => {
    const msgs = (content: string): CoreMessage[] => [{ role: 'user', content }];
    return enc.countMessages(msgs(withSample)) - enc.countMessages(msgs(base));
  };

  if (probe) {
    await runProbe();
    return;
  }

  // Identify the family of models that have none, by scoring the provider's own
  // token accounting against every family's local count. See the header comment.
  async function runProbe(): Promise<void> {
    const sampleNames = Object.keys(PROBE_SAMPLES);
    const samples = Object.entries(PROBE_SAMPLES).map(([name, text]) => ({ name, text: text.repeat(repeat) }));

    // Local reference deltas: one row per family, one column per sample. Free —
    // no API calls — and computed up front so a tokenizer that can't load is a
    // hard error before any quota is spent.
    const local = new Map<string, number[]>();
    const encoderFor = new Map<string, TokenizerEncoder>();
    for (const family of ALL_FAMILIES) {
      const encoder = await loadExactEncoder(family); // throws loudly; see loadExactEncoder
      encoderFor.set(family, encoder);
      local.set(family, samples.map(s => delta(encoder, ANCHOR, ANCHOR + s.text)));
    }

    // Which families this sample set can actually tell apart. A pair separated
    // by 0 on every sample is indistinguishable *by construction*, not by
    // measurement, and both members are reported together on a match.
    const separation: string[] = [];
    const indistinguishable: string[] = [];
    for (let i = 0; i < ALL_FAMILIES.length; i++) {
      for (let j = i + 1; j < ALL_FAMILIES.length; j++) {
        const [a, b] = [ALL_FAMILIES[i], ALL_FAMILIES[j]];
        const diffs = local.get(a)!.map((v, k) => v - local.get(b)![k]);
        const best = Math.max(...diffs.map(Math.abs));
        separation.push(`${a}\tvs ${b}\tmax=${best}\tper-sample=[${diffs.join(', ')}]${best === 0 ? '\tINDISTINGUISHABLE' : ''}`);
        if (best === 0) indistinguishable.push(`${a} == ${b}`);
      }
    }

    const matrix = [
      ['family', ...sampleNames].join('\t'),
      ...ALL_FAMILIES.map(f => [f, ...local.get(f)!].join('\t')),
      '',
      'Pairwise separation (max |delta difference| across samples):',
      ...separation.map(s => `  ${s}`),
    ];

    if (dryRun) {
      const header = `Dry run — local separation matrix for ${ALL_FAMILIES.length} families over ${samples.length} samples (repeat=${repeat})`;
      const lines = [header, '', ...matrix];
      writeFileSync(PROBE_RESULTS_PATH, lines.join('\n') + '\n');
      console.log([header, '', ...matrix].join('\n'));
      console.log(`\nResults written to ${PROBE_RESULTS_PATH}`);
      return;
    }

    const probeRows: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const modelPref = modelPreference(item);
      const known = resolveTokenizerFamily(item.modelId);
      const label = `[${i + 1}/${items.length}] ${modelPref}${known ? ` (control, known=${known})` : ''}`;
      process.stdout.write(`${label} … `);

      // Per round: one anchor call, then one call per sample. Re-anchoring each
      // round keeps a round internally consistent even if the provider routes
      // the next round to a different upstream.
      const observed: number[][] = [];
      let failure: string | null = null;
      for (let round = 0; round < rounds && !failure; round++) {
        try {
          const { model: resolved } = resolveModel(modelPref);
          const call = (content: string) => generateText({
            model: resolved,
            messages: [{ role: 'user', content }],
            maxTokens: 1,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
          });
          const anchorTokens = (await call(ANCHOR)).usage.promptTokens;
          const deltas: number[] = [];
          for (const s of samples) {
            const withSample = (await call(ANCHOR + s.text)).usage.promptTokens;
            if (typeof anchorTokens !== 'number' || typeof withSample !== 'number') {
              failure = 'provider returned no promptTokens';
              break;
            }
            deltas.push(withSample - anchorTokens);
          }
          if (!failure) observed.push(deltas);
        } catch (error) {
          failure = describeError(error);
        }
      }

      if (failure) {
        probeRows.push([modelPref, known ?? '-', 'failed', failure].join('\t'));
        console.log(`failed: ${failure}`);
        continue;
      }

      // A provider that load balances can answer two identical requests
      // differently — zen charges the multilingual block 168 on one upstream and
      // 247 on another — so take each sample's *modal* delta across rounds
      // rather than whichever round happened to land. Per sample, not per round:
      // the deviation is usually confined to one sample (the shared anchor is
      // fine), and discarding the whole round would throw away good columns.
      const spread: string[] = [];
      const first: number[] = [];
      let weakest = rounds;
      for (let k = 0; k < samples.length; k++) {
        const column = observed.map(r => r[k]);
        const counts = new Map<number, number>();
        for (const v of column) counts.set(v, (counts.get(v) ?? 0) + 1);
        const [value, support] = [...counts].sort((a, b) => b[1] - a[1])[0];
        first.push(value);
        weakest = Math.min(weakest, support);
        if (counts.size > 1) spread.push(`${sampleNames[k]}: ${[...counts].map(([v, n]) => `${v}x${n}`).join(' ')}`);
      }

      // No majority anywhere means the provider never settled on one answer:
      // that is routing noise, not a tokenizer signal. Refuse to score it.
      if (weakest * 2 <= rounds) {
        const detail = spread.join('; ');
        probeRows.push([modelPref, known ?? '-', 'unstable', `no majority across ${rounds} rounds: ${detail}`].join('\t'));
        console.log(`UNSTABLE across rounds: ${detail}`);
        continue;
      }
      const consensusNote = spread.length ? ` [consensus ${weakest}/${rounds}; spread ${spread.join('; ')}]` : '';

      const matches = ALL_FAMILIES.filter(f => local.get(f)!.every((v, k) => v === first[k]));
      const serverStr = sampleNames.map((n, k) => `${n}=${first[k]}`).join(' ');
      if (matches.length === 0) {
        // Expected for most unmapped models — they really are a family we have
        // no backend for. Record the nearest miss so a near-match is visible.
        const nearest = ALL_FAMILIES
          .map(f => ({ f, off: local.get(f)!.map((v, k) => v - first[k]) }))
          .sort((a, b) => Math.max(...a.off.map(Math.abs)) - Math.max(...b.off.map(Math.abs)))[0];
        probeRows.push([modelPref, known ?? '-', 'no-match', `server ${serverStr}; nearest ${nearest.f} off by [${nearest.off.join(', ')}]${consensusNote}`].join('\t'));
        console.log(`no known family (server ${serverStr}; nearest ${nearest.f})`);
        continue;
      }

      // Margin: how far the closest *non*-matching family sat from the observed
      // deltas. A 1-token margin means the sample set barely separated them and
      // the identification should not be trusted.
      const margin = Math.min(...ALL_FAMILIES
        .filter(f => !matches.includes(f))
        .map(f => Math.max(...local.get(f)!.map((v, k) => Math.abs(v - first[k])))));

      // Tie-break, paying for the extra calls only when there is a tie to break
      // and only when TIEBREAK_SAMPLE actually separates the tied families.
      let tieNote = '';
      let winners = matches;
      const tieLocal = new Map(matches.map(f => [f, delta(encoderFor.get(f)!, ANCHOR, ANCHOR + TIEBREAK_SAMPLE)]));
      if (matches.length > 1 && new Set(tieLocal.values()).size > 1) {
        try {
          const { model: resolved } = resolveModel(modelPref);
          const call = (content: string) => generateText({
            model: resolved,
            messages: [{ role: 'user', content }],
            maxTokens: 1,
            maxRetries: 0,
            abortSignal: AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
          });
          const anchorTokens = (await call(ANCHOR)).usage.promptTokens;
          const withSample = (await call(ANCHOR + TIEBREAK_SAMPLE)).usage.promptTokens;
          const tieDelta = withSample - anchorTokens;
          const broken = matches.filter(f => tieLocal.get(f) === tieDelta);
          const expected = matches.map(f => `${f}=${tieLocal.get(f)}`).join(' ');
          if (broken.length > 0 && broken.length < matches.length) {
            winners = broken;
            tieNote = ` [tie-break on special tokens: server=${tieDelta}, ${expected}]`;
          } else {
            // The provider may strip or re-template special-token literals, in
            // which case its count matches nobody. Report the tie honestly
            // rather than picking a winner the measurement didn't pick.
            tieNote = ` [tie-break inconclusive: server=${tieDelta}, ${expected}]`;
          }
        } catch (error) {
          tieNote = ` [tie-break failed: ${describeError(error)}]`;
        }
      }
      const verdict = winners.join(' | ');
      const status = known ? (winners.includes(known) ? 'control-ok' : 'control-FAILED') : 'identified';
      probeRows.push([modelPref, known ?? '-', status, `${verdict} (server ${serverStr}; margin ${margin} tokens over nearest other family)${tieNote}${consensusNote}`].join('\t'));
      console.log(`${status.toUpperCase()}: ${verdict} — margin ${margin}`);
      if (status === 'control-FAILED') process.exitCode = 1;
    }

    const identified = probeRows.filter(r => r.includes('\tidentified\t')).length;
    const header = `Probed ${items.length} model(s) against ${ALL_FAMILIES.length} families over ${samples.length} samples (rounds=${rounds}, repeat=${repeat}) — ${identified} identified`;
    const lines = [header, ...(indistinguishable.length ? [`Indistinguishable by construction: ${indistinguishable.join(', ')}`] : []), '', ...probeRows, '', ...matrix];
    writeFileSync(PROBE_RESULTS_PATH, lines.join('\n') + '\n');
    console.log(`\n${header}`);
    console.log(`Results written to ${PROBE_RESULTS_PATH}`);
  }

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
