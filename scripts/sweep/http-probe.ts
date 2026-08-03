/* ---------------------------------------------------------------------------
 * HTTP diagnostics
 *
 * A run reports one verdict per unit, which is the wrong resolution for asking
 * "did rate limiting actually get handled?": a unit that ate five 429s and then
 * answered looks identical to one that never saw a limit at all. These probes
 * record every physical request and every backoff wait, so a terminal 429 can be
 * told apart from a handled one and both can be counted.
 *
 * It stays a global `fetch` wrapper rather than an adapter-level hook in `src/`:
 * the wrapper sees strictly more (every attempt, its status, its headers), and
 * measurement of provider behaviour is a sweep-harness concern, not something
 * the shipped CLI should carry.
 * ------------------------------------------------------------------------- */
import { AsyncLocalStorage } from 'async_hooks';
import type { SweepOutcome } from './types.js';
import { ERROR_VERDICT } from './types.js';

/** Set for the duration of one unit's work, so probe records can be attributed to it. */
export const unitContext = new AsyncLocalStorage<{ index: number; requests: number }>();

interface HttpAttempt {
  unitIndex: number | null;
  /** ms since the sweep started. */
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
  unitIndex: number | null;
  atMs: number;
  label: string;
  plannedMs: number;
}

let runStartedAt = Date.now();
let attempts: HttpAttempt[] = [];
let waits: WaitEvent[] = [];

export function resetDiagnostics(): void {
  runStartedAt = Date.now();
  attempts = [];
  waits = [];
}

export function recordWait(label: string, plannedMs: number): void {
  waits.push({
    unitIndex: unitContext.getStore()?.index ?? null,
    atMs: Date.now() - runStartedAt,
    label,
    plannedMs,
  });
}

/**
 * Wrap `globalThis.fetch` to record status and rate-limit headers of every
 * request the adapter makes, retries included. Headers and status only — the
 * body is never read here, because `formatOpenAICompatHttpError` and
 * `captureProviderUsage` already clone it and a third consumer is one too many.
 */
export function installFetchProbe(): void {
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const startedAt = Date.now();
    const context = unitContext.getStore();
    if (context) context.requests++;
    const record = (status: number, headers: Headers | null, transportError?: string): void => {
      attempts.push({
        unitIndex: context?.index ?? null,
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
export function diagnosticsReport<Unit>(outcomes: SweepOutcome<Unit>[], unitNoun: string): string[] {
  const rateLimited = attempts.filter(a => a.status === 429);
  const withRetryAfter = rateLimited.filter(a => a.retryAfter !== null);
  const failed = outcomes.filter(o => o.verdict === ERROR_VERDICT);
  const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

  const lines = [
    '## HTTP diagnostics',
    '',
    `- requests: ${attempts.length} for ${outcomes.length} ${unitNoun}s (${statusHistogram(attempts)})`,
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
      const unit = record.unitIndex === null ? 'unattributed' : outcomes[record.unitIndex]?.label;
      lines.push(`${seconds(record.atMs).padStart(8)}  ${unit}`);
    }
    lines.push('```');
  }

  if (failed.length > 0) {
    lines.push('', '### Terminal failures', '', '```');
    for (const outcome of failed) {
      lines.push(
        `${seconds(outcome.startedAtMs).padStart(8)} start  ${seconds(outcome.durationMs).padStart(7)} spent  ` +
          `${String(outcome.requests).padStart(2)} requests  ${outcome.label}`,
      );
    }
    lines.push('```');
  }

  const perUnit = outcomes.map(o => o.requests).filter(n => n > 0).sort((a, b) => a - b);
  if (perUnit.length > 0) {
    lines.push(
      '',
      `Requests per ${unitNoun}: min ${perUnit[0]} · median ${perUnit[Math.floor(perUnit.length / 2)]} · max ${perUnit[perUnit.length - 1]}.`,
      `A ${unitNoun} that never hits a limit sends 1; anything above that is retry traffic.`,
    );
  }
  return lines;
}
