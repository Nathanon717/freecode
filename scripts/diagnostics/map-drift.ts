#!/usr/bin/env tsx
/**
 * Map-drift detector (prototype).
 *
 * Pairs every `src/**\/*.ts` file with its `docs/map/**\/*.md` page (the same
 * 1:1 path rule scripts/checks/check-map.ts enforces) and asks an LLM whether
 * the page's hand-written prose still matches the code, with the code as the
 * source of truth. Per pair the model answers `OK` or `DRIFT: <what drifted>`.
 *
 * The generated blocks (`<!-- BEGIN GENERATED ... -->`) are stripped before the
 * prompt is built: they are machine-synced from the same source we are already
 * sending, so they carry no signal and would just bait models into reporting
 * signature mismatches that `npm run docs:generate` fixes on its own.
 *
 * Usage:
 *   npm run map-drift                          # config's defaultModel
 *   npm run map-drift -- --model groq:llama-3.3-70b-versatile
 *   npm run map-drift -- --model a:b --model c:d   # compare two models
 *   npm run map-drift -- --only agent/ --limit 5   # fast prompt-iteration loop
 *
 * Flags:
 *   --model <provider:model>  Repeatable. Each model runs the full file set.
 *   --only <substring>        Only pairs whose src path contains this.
 *   --limit <n>              Stop after n pairs.
 *   --concurrency <n>        In-flight requests per model (default 8). Concurrent
 *                            calls share one rate-limit gate, so a 429 seen by any
 *                            one of them parks the rest for the same window.
 *   --out <dir>              Results directory (default alongside this script).
 *
 * Every report ends with an HTTP diagnostics section: one line per physical
 * request the run made, so handled rate limiting (retried, then answered) can be
 * told apart from terminal rate limiting (retries exhausted, reported as an
 * error). See installFetchProbe.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classify, type Verdict } from './map-drift-classify.js';

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SRC_ROOT = join(ROOT, 'src');
const MAP_ROOT = join(ROOT, 'docs', 'map');
// Generous: the largest files (tools/index.ts at 453 lines) took ~110s on a
// free model, so a tighter ceiling turns the slowest real answers into errors.
const PER_PAIR_TIMEOUT_MS = 300_000;

interface Pair {
  sourceRelative: string;
  mapRelative: string;
  code: string;
  page: string;
}

interface Outcome {
  pair: Pair;
  verdict: Verdict;
  detail: string;
  /** Verdict read only after unwrapping a non-compliant answer. See map-drift-classify.ts. */
  recovered: boolean;
  durationMs: number;
  /** Run-relative start, so failures can be checked for clustering in one window. */
  startedAtMs: number;
  /** Physical HTTP requests this pair made, retries included. See installFetchProbe. */
  requests: number;
}

interface Options {
  models: string[];
  only?: string;
  limit?: number;
  concurrency: number;
  outDir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const models: string[] = [];
  let only: string | undefined;
  let limit: number | undefined;
  let concurrency = 8;
  let outDir = join(__dirname, 'map-drift');
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    const needsValue = (): string => {
      if (value === undefined) throw new Error(`${arg} requires a value`);
      i++;
      return value;
    };
    switch (arg) {
      case '--model': models.push(needsValue()); break;
      case '--only': only = needsValue(); break;
      case '--limit': limit = Number(needsValue()); break;
      case '--concurrency': concurrency = Number(needsValue()); break;
      case '--out': outDir = needsValue(); break;
      case '--dry-run': dryRun = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { models, only, limit, concurrency, outDir, dryRun };
}

function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

function walkFiles(dir: string, ext: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, ext);
    if (!entry.isFile() || !fullPath.endsWith(ext)) return [];
    return [fullPath];
  });
}

// Same rule as scripts/checks/check-map.ts (which has no exports to reuse).
function sourceToMapPath(sourcePath: string): string {
  return join(MAP_ROOT, relative(SRC_ROOT, sourcePath).replace(/\.ts$/, '.md'));
}

function stripGeneratedBlocks(page: string): string {
  return page
    .replace(/<!--\s*BEGIN GENERATED[\s\S]*?<!--\s*END GENERATED[^>]*-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function collectPairs(options: Options): Pair[] {
  const sourceFiles = walkFiles(SRC_ROOT, '.ts').sort();
  const pairs: Pair[] = [];
  const missing: string[] = [];

  for (const sourceFile of sourceFiles) {
    const sourceRelative = toPosix(relative(ROOT, sourceFile));
    const mapFile = sourceToMapPath(sourceFile);
    let page: string;
    try {
      page = readFileSync(mapFile, 'utf-8');
    } catch {
      // Recorded for every source file, not just the --only subset, so the
      // 1:1 pairing assumption is checked in full on every run.
      missing.push(sourceRelative);
      continue;
    }
    if (options.only && !sourceRelative.includes(options.only)) continue;
    pairs.push({
      sourceRelative,
      mapRelative: toPosix(relative(ROOT, mapFile)),
      code: readFileSync(sourceFile, 'utf-8'),
      page: stripGeneratedBlocks(page),
    });
  }

  if (missing.length > 0) {
    // check-map.ts is the enforcer; here an unpaired file is just skipped work.
    console.warn(`Warning: ${missing.length} source file(s) have no map page: ${missing.join(', ')}`);
  }
  return options.limit === undefined ? pairs : pairs.slice(0, options.limit);
}

const SYSTEM_PROMPT = `You audit a codebase map for drift. You are given one source file and the hand-written map page that describes it. THE CODE IS THE SOURCE OF TRUTH.

The map is an agent-navigation layer, not documentation. Its rules:
- It exists purely for token reduction: it lets an agent decide which files matter WITHOUT reading them.
- Pages are deliberately terse. Brevity is correct, not a defect.
- A page carries: purpose; "read when"; export notes (intent that signatures cannot convey); key neighbors; update triggers.
- Pages must NOT duplicate reference facts, exhaustive API listings, or implementation detail.
- The page's generated blocks (auto-synced export signatures) have been REMOVED before you see it. Their absence is not drift, and missing signature/API coverage is never drift.

Drift is ONLY where the page's prose asserts something the code contradicts or no longer supports:
- a stated purpose the file no longer has,
- "read when" guidance pointing at behaviour that moved elsewhere or no longer exists,
- named neighbors, exports, symbols, flags, or files that the code no longer references,
- claims about behaviour the code contradicts,
- a substantial responsibility the file now owns that the page's purpose statement actively misrepresents.

Incompleteness is NOT drift. Terseness is NOT drift. Wanting more detail is NOT drift.

Answer format, exactly:
- First line: \`OK\` or \`DRIFT\`.
- If DRIFT: following lines list each drift as \`- <what the page claims> -> <what the code shows>\`. Be specific and cite the symbol or phrase. No preamble, no praise, no suggestions beyond the correction.`;

function buildUserPrompt(pair: Pair): string {
  return [
    `SOURCE FILE: ${pair.sourceRelative}`,
    '```typescript',
    pair.code,
    '```',
    '',
    `MAP PAGE: ${pair.mapRelative} (generated blocks stripped)`,
    '```markdown',
    pair.page,
    '```',
    '',
    'Does the map page prose drift from the code? Answer in the required format.',
  ].join('\n');
}

// Duck-types the statusCode/responseBody fields present on both real AI SDK
// APICallErrors and the plain Error the openai-compat adapter throws.
function describeError(error: unknown): string {
  const e = error as { statusCode?: unknown; responseBody?: unknown };
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = typeof e?.statusCode === 'number' ? e.statusCode : undefined;
  let detail = statusCode !== undefined && !message.includes(`HTTP ${statusCode}`)
    ? `HTTP ${statusCode}: ${message}`
    : message;
  if (typeof e?.responseBody === 'string') {
    const trimmed = e.responseBody.trim().slice(0, 500);
    if (trimmed && !detail.includes(trimmed.slice(0, 50))) detail += ` — body: ${trimmed}`;
  }
  return detail;
}

function formatElapsed(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  return `${Math.floor(seconds / 60)}m${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
}

function sanitize(modelPref: string): string {
  return modelPref.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

/* ---------------------------------------------------------------------------
 * HTTP diagnostics
 *
 * A run reports one verdict per pair, which is the wrong resolution for asking
 * "did rate limiting actually get handled?": a pair that ate five 429s and then
 * answered looks identical to one that never saw a limit at all. These probes
 * record every physical request and every backoff wait, so a terminal 429 can be
 * told apart from a handled one and both can be counted.
 *
 * Deliberately kept in this script rather than added as a hook in src/: it is
 * throwaway measurement, and a global fetch wrapper sees strictly more than an
 * adapter-level callback (every attempt, its status, its headers).
 * ------------------------------------------------------------------------- */

/** Set for the duration of one pair's work, so probe records can be attributed to it. */
const pairContext = new AsyncLocalStorage<{ index: number; requests: number }>();

interface HttpAttempt {
  pairIndex: number | null;
  /** ms since the model's sweep started. */
  atMs: number;
  status: number;
  durationMs: number;
  retryAfter: string | null;
  remainingReq: string | null;
  remainingTokens: string | null;
  limitReq: string | null;
  limitTokens: string | null;
  transportError?: string;
}

interface WaitEvent {
  pairIndex: number | null;
  atMs: number;
  label: string;
  plannedMs: number;
}

let runStartedAt = Date.now();
let attempts: HttpAttempt[] = [];
let waits: WaitEvent[] = [];

function resetDiagnostics(): void {
  runStartedAt = Date.now();
  attempts = [];
  waits = [];
}

/**
 * Wrap `globalThis.fetch` to record status and rate-limit headers of every
 * request the adapter makes, retries included. Headers and status only — the
 * body is never read here, because `formatOpenAICompatHttpError` and
 * `captureProviderUsage` already clone it and a third consumer is one too many.
 */
function installFetchProbe(): void {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const startedAt = Date.now();
    const context = pairContext.getStore();
    if (context) context.requests++;
    const record = (status: number, headers: Headers | null, transportError?: string): void => {
      attempts.push({
        pairIndex: context?.index ?? null,
        atMs: startedAt - runStartedAt,
        status,
        durationMs: Date.now() - startedAt,
        retryAfter: headers?.get('retry-after') ?? null,
        remainingReq: headers?.get('x-ratelimit-remaining-req-minute') ?? null,
        remainingTokens: headers?.get('x-ratelimit-remaining-tokens-minute') ?? null,
        limitReq: headers?.get('x-ratelimit-limit-req-minute') ?? null,
        limitTokens: headers?.get('x-ratelimit-limit-tokens-minute') ?? null,
        ...(transportError ? { transportError } : {}),
      });
    };
    try {
      const response = await original(input, init);
      record(response.status, response.headers);
      return response;
    } catch (error) {
      record(0, null, error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
}

function statusHistogram(records: HttpAttempt[]): string {
  const counts = new Map<number, number>();
  for (const record of records) counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([status, n]) => `${status === 0 ? 'transport-error' : status}×${n}`)
    .join(' · ');
}

/**
 * The question this answers: were the terminal 429s a burst (every worker
 * exhausting its attempts in the same window, i.e. too many in flight) or
 * spread out (a limit too long to ride out at any concurrency)?
 */
function diagnosticsReport(outcomes: Outcome[]): string[] {
  const rateLimited = attempts.filter(a => a.status === 429);
  const withRetryAfter = rateLimited.filter(a => a.retryAfter !== null);
  const failed = outcomes.filter(o => o.verdict === 'error');
  const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

  const lines = [
    '## HTTP diagnostics',
    '',
    `- requests: ${attempts.length} for ${outcomes.length} pairs (${statusHistogram(attempts)})`,
    `- 429 responses: ${rateLimited.length} total, of which ${failed.length} were terminal (retries exhausted, surfaced as an error)`,
    `- 429s carrying a \`retry-after\` header: ${withRetryAfter.length}/${rateLimited.length}` +
      (withRetryAfter.length > 0 ? ` (values: ${[...new Set(withRetryAfter.map(a => a.retryAfter))].join(', ')})` : ''),
    // Aggregate, not wall clock: N workers waiting the same 16s window contribute
    // N×16s here while the run only stalls once.
    `- backoff waits: ${waits.length}, ${seconds(waits.reduce((sum, w) => sum + w.plannedMs, 0))} summed across workers (not wall time)`,
  ];

  const ok = attempts.filter(a => a.status === 200).map(a => a.durationMs).sort((a, b) => a - b);
  if (ok.length > 0) {
    // Sets the achievable send rate: concurrency / median latency is the offered
    // req/min to compare against the provider's per-minute ceiling.
    lines.push(`- successful call latency: median ${seconds(ok[Math.floor(ok.length / 2)])} · max ${seconds(ok[ok.length - 1])}`);
  }

  // Which bucket is empty decides the fix: a requests bucket says "fewer in
  // flight", a tokens bucket says "smaller prompts".
  const bucket = (label: string, pick: (a: HttpAttempt) => string | null): string => {
    const values = [...new Set(rateLimited.map(pick).filter((v): v is string => v !== null))];
    return `${label} ${values.length > 0 ? values.join('/') : 'absent'}`;
  };
  const withHeaders = rateLimited.filter(a => a.remainingReq !== null || a.remainingTokens !== null);
  lines.push(
    `- rate-limit headers on 429s: ${withHeaders.length}/${rateLimited.length} carried them` +
      ` — ${bucket('req remaining', a => a.remainingReq)} of ${bucket('limit', a => a.limitReq)},` +
      ` ${bucket('tokens remaining', a => a.remainingTokens)} of ${bucket('limit', a => a.limitTokens)}`,
  );

  if (rateLimited.length > 0) {
    const first = rateLimited[0].atMs;
    const last = rateLimited[rateLimited.length - 1].atMs;
    lines.push(`- 429 window: ${seconds(first)} → ${seconds(last)} into the run`);
    lines.push('', '### 429 timeline (seconds into run)', '', '```');
    for (const record of rateLimited) {
      const pair = record.pairIndex === null ? 'unattributed' : outcomes[record.pairIndex]?.pair.sourceRelative;
      lines.push(`${seconds(record.atMs).padStart(8)}  ${pair}`);
    }
    lines.push('```');
  }

  if (failed.length > 0) {
    lines.push('', '### Terminal failures', '', '```');
    for (const outcome of failed) {
      lines.push(
        `${seconds(outcome.startedAtMs).padStart(8)} start  ${seconds(outcome.durationMs).padStart(7)} spent  ` +
          `${String(outcome.requests).padStart(2)} requests  ${outcome.pair.sourceRelative}`,
      );
    }
    lines.push('```');
  }

  const perPair = outcomes.map(o => o.requests).filter(n => n > 0).sort((a, b) => a - b);
  if (perPair.length > 0) {
    lines.push(
      '',
      `Requests per pair: min ${perPair[0]} · median ${perPair[Math.floor(perPair.length / 2)]} · max ${perPair[perPair.length - 1]}.`,
      `A pair that never hits a limit sends 1; anything above that is retry traffic.`,
    );
  }
  return lines;
}

/**
 * Current provider-side retry wait, fed by the adapter's retry banner sink (this
 * script does not go through `src/index.ts`, so nothing registers one for it). A
 * `retry-after` is honored in full and can be minutes long; without this the status
 * line's ticker keeps moving and a parked run is indistinguishable from a working one.
 */
let retryHold: { label: string; targetMs: number } | null = null;

function retryHoldSuffix(): string {
  if (!retryHold) return '';
  const remaining = retryHold.targetMs - Date.now();
  if (remaining <= 0) return '';
  return ` · ${retryHold.label} ${Math.ceil(remaining / 1000)}s`;
}

/** Runs `worker` over `items` with at most `concurrency` in flight, in order. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

interface Reporter {
  complete(outcome: Outcome): void;
  finish(): void;
}

/**
 * Prints findings only. Clean files never get a line — with ~100 of 107 pairs
 * expected to be clean, per-file "ok" output is noise that buries the drift.
 * Liveness comes from a single in-place counter line, clipped to the terminal
 * width so it overwrites itself instead of wrapping into a new row per tick.
 */
function createReporter(total: number): Reporter {
  const isTTY = process.stdout.isTTY === true;
  const counts: Record<Verdict, number> = { ok: 0, drift: 0, error: 0, unparsed: 0 };
  let done = 0;
  let recovered = 0;
  const startedAt = Date.now();

  const clip = (text: string): string => {
    const width = process.stdout.columns ?? 80;
    return text.length >= width ? `${text.slice(0, width - 2)}…` : text;
  };

  const statusLine = (): string => {
    const parts = [`drift ${counts.drift}`];
    if (counts.error > 0) parts.push(`err ${counts.error}`);
    if (counts.unparsed > 0) parts.push(`unparsed ${counts.unparsed}`);
    if (recovered > 0) parts.push(`recovered ${recovered}`);
    return `[${done}/${total}] ${parts.join(' · ')} · ${formatElapsed(Date.now() - startedAt)}${retryHoldSuffix()}`;
  };

  const render = (): void => {
    if (isTTY) process.stdout.write(`\r\x1b[K${clip(statusLine())}`);
  };
  const timer = isTTY ? setInterval(render, 1000) : undefined;
  render();

  const emit = (text: string): void => {
    if (isTTY) {
      process.stdout.write(`\r\x1b[K${text}\n`);
      render();
    } else {
      console.log(text);
    }
  };

  return {
    complete(outcome: Outcome): void {
      counts[outcome.verdict]++;
      done++;
      if (outcome.recovered) recovered++;
      if (outcome.verdict === 'ok') return;

      const label = outcome.verdict === 'drift' ? 'DRIFT' : outcome.verdict.toUpperCase();
      emit(`${label}  ${outcome.pair.sourceRelative}`);
      for (const line of outcome.detail.split('\n')) {
        if (line.trim()) emit(`       ${line.trim()}`);
      }
    },
    finish(): void {
      if (timer) clearInterval(timer);
      if (isTTY) process.stdout.write('\r\x1b[K');
    },
  };
}

function pairCount(n: number): string {
  return `${n} pair${n === 1 ? '' : 's'}`;
}

function summarize(outcomes: Outcome[], elapsedMs: number): string {
  const count = (v: Verdict): number => outcomes.filter(o => o.verdict === v).length;
  const parts = [pairCount(outcomes.length), `${count('ok')} ok`, `${count('drift')} drift`];
  if (count('error') > 0) parts.push(`${count('error')} error`);
  if (count('unparsed') > 0) parts.push(`${count('unparsed')} unparsed`);
  const recovered = outcomes.filter(o => o.recovered).length;
  if (recovered > 0) parts.push(`${recovered} recovered`);
  return `${parts.join(' · ')} · ${formatElapsed(elapsedMs)}`;
}

function writeReport(outDir: string, modelPref: string, outcomes: Outcome[], elapsedMs: number): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `${sanitize(modelPref)}.md`);

  // Findings only. Clean pairs are not listed at all — with ~100 of 107 expected
  // clean, naming them buries the drift; the `N ok` count in the summary line is
  // the whole signal they carry.
  const lines = [`# Map drift — ${modelPref}`, '', summarize(outcomes, elapsedMs), ''];

  for (const outcome of outcomes) {
    if (outcome.verdict === 'ok') continue;
    const suffix = outcome.verdict === 'drift' ? '' : ` — ${outcome.verdict.toUpperCase()}`;
    // Recovery is noted, not hidden: the verdict is trustworthy, the model's
    // format compliance is not, and that is worth seeing when comparing models.
    const note = outcome.recovered ? ' _(verdict recovered from a malformed answer)_' : '';
    lines.push(`## ${outcome.pair.sourceRelative}${suffix}${note}`, '', outcome.detail, '');
  }

  lines.push(...diagnosticsReport(outcomes), '');

  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // Pair collection touches no provider, so --dry-run verifies the path rule
  // over the whole tree without spending a single call.
  if (options.dryRun) {
    const pairs = collectPairs(options);
    console.log(`${pairCount(pairs.length)} would be checked:`);
    for (const pair of pairs) console.log(`  ${pair.sourceRelative} -> ${pair.mapRelative}`);
    return;
  }

  tryInjectDoppler();

  // Dynamic imports so doppler-injected env vars are in place before any
  // provider module evaluates (see tryInjectDoppler above).
  const { resolveModel } = await import('../../src/providers/provider-registry.js');
  const { loadConfig } = await import('../../src/config/index.js');
  const { registerRetryBannerSink } = await import('../../src/providers/adapters/adapter-http-retry.js');
  const { streamText } = await import('ai');

  installFetchProbe();
  // The sink fires inside the waiting call's async context, so each wait is
  // attributable to a pair; `null` just closes the display and is not recorded.
  registerRetryBannerSink(info => {
    retryHold = info;
    if (!info) return;
    waits.push({
      pairIndex: pairContext.getStore()?.index ?? null,
      atMs: Date.now() - runStartedAt,
      label: info.label,
      plannedMs: info.targetMs - Date.now(),
    });
  });

  const configuredModel = loadConfig().defaultModel;
  const models = options.models.length > 0
    ? options.models
    : configuredModel ? [configuredModel] : [];
  if (models.length === 0) {
    console.error('No model selected. Pass --model provider:model, or set one with /model.');
    process.exitCode = 1;
    return;
  }

  const pairs = collectPairs(options);
  if (pairs.length === 0) {
    console.error('No source/map pairs matched.');
    process.exitCode = 1;
    return;
  }

  for (const modelPref of models) {
    // Resolved once per model, not once per pair: a bad --model string fails
    // here instead of producing one identical error per file.
    const { model } = resolveModel(modelPref);
    console.log(`\n${modelPref} — ${pairCount(pairs.length)}, concurrency ${options.concurrency}\n`);
    const reporter = createReporter(pairs.length);
    const startedAt = Date.now();

    resetDiagnostics();

    const outcomes = await mapPool(pairs, options.concurrency, async (pair, index): Promise<Outcome> =>
      pairContext.run({ index, requests: 0 }, async (): Promise<Outcome> => {
      const pairStartedAt = Date.now();
      let verdict: Verdict;
      let detail: string;
      let recovered = false;
      try {
        const result = await streamText({
          model,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildUserPrompt(pair) }],
          temperature: 0,
          maxRetries: 2,
          abortSignal: AbortSignal.timeout(PER_PAIR_TIMEOUT_MS),
        });
        // Errors surface on consumption, not at the call site — the stream must
        // be drained inside the try/catch or failures go unnoticed.
        for await (const _chunk of result.textStream) {
          // discard; the assembled text is read below
        }
        ({ verdict, detail, recovered } = classify(await result.text));
      } catch (error) {
        verdict = 'error';
        detail = describeError(error);
      }
      const outcome: Outcome = {
        pair,
        verdict,
        detail,
        recovered,
        durationMs: Date.now() - pairStartedAt,
        startedAtMs: pairStartedAt - runStartedAt,
        requests: pairContext.getStore()?.requests ?? 0,
      };
      reporter.complete(outcome);
      return outcome;
    }));

    reporter.finish();
    const elapsedMs = Date.now() - startedAt;
    const path = writeReport(options.outDir, modelPref, outcomes, elapsedMs);
    console.log(`\n${summarize(outcomes, elapsedMs)}`);
    console.log(`→ ${toPosix(relative(ROOT, path))}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
