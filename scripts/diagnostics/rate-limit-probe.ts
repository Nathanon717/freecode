/**
 * Rate-limit probe: what does each provider actually tell us when we hit its limit?
 *
 * Answers, per provider, the questions `docs/ideas/retry-handling.md` needs before any
 * per-provider retry policy can be written:
 *
 *   1. Is there a read-only quota endpoint (zero inference calls)?
 *   2. What rate-limit headers come back on a 200 *non-streaming* response?
 *   3. What comes back on a 200 *streaming* response? (The agent path streams. Mistral
 *      proves a provider can expose limits on one and not the other.)
 *   4. What comes back on the 429 itself — `retry-after`? an exhausted bucket? a reset?
 *   5. Is there a usable reset hint in the 429 *body*? (Groq writes one in prose.)
 *   6. How long until the limit actually clears, measured rather than assumed?
 *
 * Deliberately does NOT go through the adapter stack: `fetchWithRetry` would absorb the
 * 429s we are trying to observe, and quirks like Mistral's `forcedNonStream` would change
 * what is being measured. Raw fetch against the catalog's baseUrl only.
 *
 * Quota-cheap by construction: `max_tokens: 1` and a one-word prompt, so the *requests*
 * bucket trips while token buckets stay untouched, and the burst is sized off the limit
 * the provider just told us rather than a flat large number.
 *
 * Usage:
 *   npm run rate-limit-probe                        # every free provider with a key
 *   npm run rate-limit-probe -- --only groq,mistral
 *   npm run rate-limit-probe -- --burst 30 --recover-budget 120
 *   npm run rate-limit-probe -- --no-burst          # read-only: quota + 200 probes
 */
import { mkdirSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Mirrors src/index.ts's tryInjectDoppler(). Must run before importing the catalog,
// since Cloudflare's baseUrl reads an env var at module-evaluation time.
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
tryInjectDoppler();

const { PROVIDER_REGISTRY } = await import('../../src/providers/provider-catalog.js');

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Per-provider probe inputs the catalog does not carry. */
interface ProbeSpec {
  /** Smallest/cheapest model on the free tier — keeps token buckets out of the way. */
  model: string;
  /** Read-only quota endpoint, relative to baseUrl or absolute. */
  quotaPath?: string;
  /** Some providers reject `max_tokens`; others reject the newer name. */
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
}

const SPECS: Record<string, ProbeSpec> = {
  groq: { model: 'llama-3.1-8b-instant' },
  openrouter: { model: 'nvidia/nemotron-nano-9b-v2:free', quotaPath: '/key' },
  siliconflow: { model: '', quotaPath: '/user/info' },
  nvidia: { model: 'meta/llama-3.1-8b-instruct' },
  llm7: { model: 'codestral-latest' },
  github: { model: 'gpt-4o-mini' },
  cohere: { model: 'command-r7b-12-2024' },
  cerebras: { model: 'gemma-4-31b' },
  // mistral-medium, not a ministral: request ceilings are per-model on Mistral (750/min
// for ministral-3b vs 23/min here), and the medium tier is what the agent actually uses.
  mistral: { model: 'mistral-medium-2508' },
  cloudflare: { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  zai: { model: 'glm-4.5-flash' },
  huggingface: { model: 'allenai/Olmo-3-7B-Instruct:publicai' },
  zen: { model: 'deepseek-v4-flash-free' },
};

interface Options {
  only: string[];
  burst: number | null;
  runBurst: boolean;
  recoverBudgetMs: number;
  outDir: string;
  /** Override the table's model. Only meaningful with a single --only provider. */
  model: string | null;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    only: [],
    burst: null,
    runBurst: true,
    recoverBudgetMs: 75_000,
    outDir: join(__dirname, 'rate-limit-probe'),
    model: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      i++;
      return value;
    };
    switch (arg) {
      case '--only': options.only = next().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--burst': options.burst = Number(next()); break;
      case '--no-burst': options.runBurst = false; break;
      case '--recover-budget': options.recoverBudgetMs = Number(next()) * 1000; break;
      case '--out': options.outDir = next(); break;
      case '--model': options.model = next(); break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

/** One HTTP observation: everything the response told us, unfiltered. */
interface Attempt {
  kind: string;
  status: number;
  /** Wall clock, not run-relative: tells a fixed minute window (clears on the :00) from
   *  a rolling one (clears one window after the request that filled it). */
  startedAt: string;
  durationMs: number;
  /** Every response header, verbatim. The whole point — a filtered list hides shapes. */
  headers: Record<string, string>;
  bodySnippet: string;
  transportError?: string;
}

interface ProviderReport {
  providerId: string;
  providerName: string;
  model: string;
  attempts: Attempt[];
  /** Measured seconds from first 429 to first success, or null if it never cleared. */
  recoverySeconds: number | null;
  recoveryPolls: { atSeconds: number; status: number }[];
  notes: string[];
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => { out[key] = value; });
  return out;
}

const RATE_LIMIT_HEADER = /rate.?limit|retry|quota|reset|remaining|credit|usage/i;

function interestingHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => RATE_LIMIT_HEADER.test(k)));
}

async function probe(
  kind: string,
  url: string,
  init: RequestInit,
  bodyLimit = 600,
): Promise<Attempt> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, init);
    // Read the body even for streams: with max_tokens 1 it is a handful of SSE frames,
    // and the 429 body is one of the signals being measured.
    const text = await response.text().catch(() => '');
    return {
      kind,
      status: response.status,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      headers: headersToRecord(response.headers),
      bodySnippet: text.slice(0, bodyLimit),
    };
  } catch (error) {
    return {
      kind,
      status: 0,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      headers: {},
      bodySnippet: '',
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}

function chatBody(spec: ProbeSpec, model: string, stream: boolean): string {
  const field = spec.maxTokensField ?? 'max_tokens';
  return JSON.stringify({
    model,
    messages: [{ role: 'user', content: 'hi' }],
    [field]: 1,
    stream,
  });
}

/** Pull a request-bucket ceiling out of whatever the provider happened to send. */
function guessRequestLimit(headers: Record<string, string>): number | null {
  const keys = [
    'x-ratelimit-limit-requests',
    'x-ratelimit-limit-req-minute',
    'x-ratelimit-limit-requests-minute',
    'x-ratelimit-limit',
    'ratelimit-limit',
  ];
  for (const key of keys) {
    const value = headers[key];
    if (value === undefined) continue;
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

function guessTokenLimit(headers: Record<string, string>): number | null {
  const keys = [
    'x-ratelimit-limit-tokens',
    'x-ratelimit-limit-tokens-minute',
  ];
  for (const key of keys) {
    const value = headers[key];
    if (value === undefined) continue;
    const n = parseInt(value, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

async function resolveModel(
  spec: ProbeSpec,
  baseUrl: string,
  authHeaders: Record<string, string>,
  report: ProviderReport,
): Promise<string> {
  if (spec.model) return spec.model;
  const attempt = await probe('GET /models', `${baseUrl}/models`, { headers: authHeaders }, 4000);
  report.attempts.push({ ...attempt, bodySnippet: attempt.bodySnippet.slice(0, 400) });
  try {
    const parsed = JSON.parse(attempt.bodySnippet) as { data?: { id?: string }[] };
    const ids = (parsed.data ?? []).map(m => m.id).filter((id): id is string => !!id);
    // Smallest name is a decent proxy for smallest model on providers we have no table for.
    const picked = ids.sort((a, b) => a.length - b.length)[0];
    if (picked) {
      report.notes.push(`model auto-picked from /models: ${picked}`);
      return picked;
    }
  } catch {
    report.notes.push('could not parse /models to auto-pick a model');
  }
  return '';
}

async function probeProvider(providerId: string, options: Options): Promise<ProviderReport> {
  const entry = PROVIDER_REGISTRY.find(p => p.id === providerId);
  const spec = SPECS[providerId];
  if (!entry || !spec) throw new Error(`no catalog entry or probe spec for ${providerId}`);
  // defaultApiKey covers keyless providers (zen's "public"), which are quota'd by IP —
  // skipping them for want of an env var would have left the class unmeasured.
  const apiKey = process.env[entry.apiKeyEnvVar] || entry.defaultApiKey || '';
  const baseUrl = entry.baseUrl.replace(/\/$/, '');

  const report: ProviderReport = {
    providerId,
    providerName: entry.name,
    model: spec.model,
    attempts: [],
    recoverySeconds: null,
    recoveryPolls: [],
    notes: [],
  };

  const authHeaders: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  const jsonHeaders = { ...authHeaders, 'content-type': 'application/json' };

  // 1. Read-only quota endpoint — the cheapest possible signal, so it goes first.
  if (spec.quotaPath) {
    const url = spec.quotaPath.startsWith('http') ? spec.quotaPath : `${baseUrl}${spec.quotaPath}`;
    report.attempts.push(await probe(`GET ${spec.quotaPath}`, url, { headers: authHeaders }, 1200));
  }

  const model = options.model ?? await resolveModel(spec, baseUrl, authHeaders, report);
  report.model = model;
  if (!model) {
    report.notes.push('no model resolved — chat probes skipped');
    return report;
  }

  // 2/3. One 200 each way. Non-stream first: if the key or model is wrong we find out
  // before spending a burst on it.
  const chatUrl = `${baseUrl}/chat/completions`;
  const nonStream = await probe('200-probe non-stream', chatUrl, {
    method: 'POST', headers: jsonHeaders, body: chatBody(spec, model, false),
  });
  report.attempts.push(nonStream);
  report.attempts.push(await probe('200-probe stream', chatUrl, {
    method: 'POST', headers: jsonHeaders, body: chatBody(spec, model, true),
  }));

  if (!options.runBurst) return report;
  if (nonStream.status !== 200 && nonStream.status !== 429) {
    report.notes.push(`non-stream probe returned ${nonStream.status}; burst skipped`);
    return report;
  }

  // 4/5. Burst until something 429s. Sized off the ceiling the provider just reported so
  // a 30 rpm provider gets 45 requests and a 6000 rpm one is not attacked at all.
  const observedLimit = guessRequestLimit(nonStream.headers);
  const burstSize = options.burst ?? (observedLimit === null
    ? 20
    : Math.min(Math.max(Math.ceil(observedLimit * 1.5), 10), 40));
  if (observedLimit !== null) report.notes.push(`burst sized from observed request limit ${observedLimit}`);
  if (observedLimit !== null && observedLimit > 200) {
    report.notes.push(`request ceiling ${observedLimit} is too high to trip cheaply; burst capped at ${burstSize}`);
  }

  // A provider whose *request* ceiling is out of reach may still have a reachable *token*
  // ceiling, and one oversized prompt trips it in a single rejected call — cheaper than any
  // burst, since the rate limiter refuses it before inference. Worth it only because the
  // 429 body/headers are the thing being measured, not the completion.
  const tokenLimit = guessTokenLimit(nonStream.headers);
  if (tokenLimit !== null && tokenLimit <= 25_000 && (observedLimit === null || observedLimit > 200)) {
    const words = Math.ceil(tokenLimit * 1.5 * 0.75);
    const attempt = await probe('token-bucket trip (oversized prompt)', chatUrl, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: `count these words: ${'word '.repeat(words)}` }],
        [spec.maxTokensField ?? 'max_tokens']: 1,
        stream: false,
      }),
    });
    report.attempts.push(attempt);
    report.notes.push(`token-trip prompt ≈${Math.round(tokenLimit * 1.5)} tokens against a ${tokenLimit}-token bucket → ${attempt.status}`);
  }

  // Streaming, because that is the path the agent actually uses: a provider that drops
  // rate-limit headers on streamed responses has to be caught here.
  const burst = await Promise.all(
    Array.from({ length: burstSize }, (_, i) =>
      probe(`burst#${i + 1} stream`, chatUrl, {
        method: 'POST', headers: jsonHeaders, body: chatBody(spec, model, true),
      }, 400),
    ),
  );
  report.attempts.push(...burst);

  const firstLimited = burst.find(a => a.status === 429);
  if (!firstLimited) {
    report.notes.push(`burst of ${burstSize} produced no 429`);
    return report;
  }

  // A 429 in hand: grab the non-streaming shape of it too, one request, while still limited.
  report.attempts.push(await probe('429-probe non-stream', chatUrl, {
    method: 'POST', headers: jsonHeaders, body: chatBody(spec, model, false),
  }));

  // 6. Measure recovery. 429s do not consume quota anywhere we know of, so polling is
  // cheap, and a measured clear time is the only way to check a provider's own reset
  // claim (or to characterise one that makes no claim at all).
  const limitedAt = Date.now();
  for (let elapsed = 0; elapsed < options.recoverBudgetMs; ) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    elapsed = Date.now() - limitedAt;
    const poll = await probe('recovery-poll', chatUrl, {
      method: 'POST', headers: jsonHeaders, body: chatBody(spec, model, false),
    }, 200);
    report.recoveryPolls.push({ atSeconds: Math.round(elapsed / 1000), status: poll.status });
    if (poll.status === 200) {
      report.recoverySeconds = Math.round(elapsed / 1000);
      report.attempts.push({ ...poll, kind: `recovery-poll @${report.recoverySeconds}s (cleared)` });
      break;
    }
  }
  if (report.recoverySeconds === null) {
    report.notes.push(`did not clear within ${options.recoverBudgetMs / 1000}s — window is longer than a minute, or the bucket is hourly/daily`);
  }

  return report;
}

function summarise(report: ProviderReport): string[] {
  const lines = [`### ${report.providerName} (${report.providerId}) — model \`${report.model}\``, ''];
  const statuses = new Map<number, number>();
  for (const a of report.attempts) statuses.set(a.status, (statuses.get(a.status) ?? 0) + 1);
  lines.push(`- statuses: ${[...statuses].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s || 'transport-error'}×${n}`).join(' · ')}`);

  for (const kind of ['200-probe non-stream', '200-probe stream', 'token-bucket trip (oversized prompt)', '429-probe non-stream']) {
    const attempt = report.attempts.find(a => a.kind === kind);
    if (!attempt) continue;
    const interesting = interestingHeaders(attempt.headers);
    const keys = Object.entries(interesting).map(([k, v]) => `\`${k}: ${v}\``);
    lines.push(`- ${kind} → ${attempt.status}: ${keys.length ? keys.join(', ') : 'no rate-limit headers'}`);
  }

  const limited = report.attempts.filter(a => a.status === 429);
  if (limited.length > 0) {
    const first = limited[0];
    const interesting = interestingHeaders(first.headers);
    lines.push(`- 429 headers (${limited.length} seen): ${Object.entries(interesting).map(([k, v]) => `\`${k}: ${v}\``).join(', ') || 'none'}`);
    lines.push(`- 429 body: \`${first.bodySnippet.replace(/\s+/g, ' ').slice(0, 300)}\``);
    lines.push(`- \`retry-after\`: ${first.headers['retry-after'] ?? 'ABSENT'}`);
  }
  if (report.recoveryPolls.length > 0) {
    lines.push(`- recovery: ${report.recoverySeconds !== null ? `cleared at ${report.recoverySeconds}s` : 'never cleared in budget'} (polls: ${report.recoveryPolls.map(p => `${p.atSeconds}s→${p.status}`).join(', ')})`);
  }
  for (const note of report.notes) lines.push(`- note: ${note}`);
  lines.push('');
  return lines;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const candidates = PROVIDER_REGISTRY
    .filter(p => !p.paid && p.type === 'openai-compat' && SPECS[p.id])
    .filter(p => (options.only.length === 0 ? true : options.only.includes(p.id)))
    .filter(p => {
      const hasKey = !!(process.env[p.apiKeyEnvVar] || p.defaultApiKey);
      if (!hasKey) console.log(`skip ${p.id}: no ${p.apiKeyEnvVar}`);
      return hasKey;
    });

  mkdirSync(options.outDir, { recursive: true });
  const reports: ProviderReport[] = [];
  for (const provider of candidates) {
    console.log(`\n=== ${provider.id} ===`);
    const report = await probeProvider(provider.id, options);
    reports.push(report);
    for (const line of summarise(report)) console.log(line);
    writeFileSync(join(options.outDir, `${provider.id}.json`), JSON.stringify(report, null, 2));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const markdown = ['# Rate-limit probe', '', `Run ${new Date().toISOString()}`, '', ...reports.flatMap(summarise)];
  writeFileSync(join(options.outDir, `summary-${stamp}.md`), markdown.join('\n'));
  console.log(`\nwrote ${reports.length} reports to ${options.outDir}`);
}

await main();
