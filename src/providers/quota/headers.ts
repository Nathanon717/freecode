import type { ObservedRateLimitBucket } from '../model-store.js';

/**
 * Pure parser for Groq rate-limit response headers.
 *
 * Groq returns standard x-ratelimit-* headers on every response:
 *   x-ratelimit-limit-requests:     30
 *   x-ratelimit-limit-tokens:       6000
 *   x-ratelimit-remaining-requests: 29
 *   x-ratelimit-remaining-tokens:   5970
 *   x-ratelimit-reset-requests:     2s
 *   x-ratelimit-reset-tokens:       1s
 *
 * Reset values use Go's time.Duration string format:
 *   "300ms", "1.5s", "2s", "1m30s", "5m", "1h30m"
 */

export interface GroqRateLimitHeaders {
  limitRequests: number | null;
  limitTokens: number | null;
  remainingRequests: number | null;
  remainingTokens: number | null;
  /** Parsed reset-requests duration in milliseconds. */
  resetRequestsMs: number | null;
  /** Parsed reset-tokens duration in milliseconds. */
  resetTokensMs: number | null;
  /** Raw reset-requests string as returned by the server, e.g. "2s". */
  resetRequestsRaw: string | null;
  /** Raw reset-tokens string as returned by the server, e.g. "1s". */
  resetTokensRaw: string | null;
}

export interface GroqRateLimitInfo extends GroqRateLimitHeaders {
  modelRpm: number | null;
  modelRpd: number | null;
  modelTpm: number | null;
  modelTpd: number | null;
}

/**
 * Parse a Go time.Duration string into milliseconds.
 *
 * Supported units: h (hours), m (minutes), s (seconds, may be fractional), ms (milliseconds).
 * Examples: "2s" → 2000, "13.5s" → 13500, "1m30s" → 90000, "300ms" → 300, "1h30m" → 5400000.
 *
 * Returns null if the string is empty or cannot be parsed.
 */
export function parseGroqDuration(s: string): number | null {
  if (!s) return null;

  let remaining = s;
  let totalMs = 0;
  let matched = false;

  // Hours
  const hourMatch = remaining.match(/^(\d+)h/);
  if (hourMatch) {
    totalMs += parseInt(hourMatch[1], 10) * 3_600_000;
    remaining = remaining.slice(hourMatch[0].length);
    matched = true;
  }

  // Minutes — must NOT be followed by 's' (which would make it 'ms')
  const minMatch = remaining.match(/^(\d+)m(?!s)/);
  if (minMatch) {
    totalMs += parseInt(minMatch[1], 10) * 60_000;
    remaining = remaining.slice(minMatch[0].length);
    matched = true;
  }

  // Seconds (integer or decimal)
  const secMatch = remaining.match(/^(\d+(?:\.\d+)?)s/);
  if (secMatch) {
    totalMs += parseFloat(secMatch[1]) * 1_000;
    remaining = remaining.slice(secMatch[0].length);
    matched = true;
  }

  // Milliseconds
  const msMatch = remaining.match(/^(\d+)ms/);
  if (msMatch) {
    totalMs += parseInt(msMatch[1], 10);
    remaining = remaining.slice(msMatch[0].length);
    matched = true;
  }

  // All input must be consumed and at least one component must have matched
  if (!matched || remaining !== '') return null;

  return Math.round(totalMs);
}

/**
 * Extract and parse Groq rate-limit headers from a fetch Response Headers object
 * or a plain string record.
 */
export function parseGroqRateLimitHeaders(
  headers: Headers | Record<string, string>
): GroqRateLimitHeaders {
  const get = (key: string): string | null =>
    headers instanceof Headers
      ? headers.get(key)
      : ((headers)[key] ?? null);

  const num = (key: string): number | null => {
    const v = get(key);
    if (v === null) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  };

  const resetRequestsRaw = get('x-ratelimit-reset-requests');
  const resetTokensRaw = get('x-ratelimit-reset-tokens');

  return {
    limitRequests: num('x-ratelimit-limit-requests'),
    limitTokens: num('x-ratelimit-limit-tokens'),
    remainingRequests: num('x-ratelimit-remaining-requests'),
    remainingTokens: num('x-ratelimit-remaining-tokens'),
    resetRequestsMs: resetRequestsRaw !== null ? parseGroqDuration(resetRequestsRaw) : null,
    resetTokensMs: resetTokensRaw !== null ? parseGroqDuration(resetTokensRaw) : null,
    resetRequestsRaw,
    resetTokensRaw,
  };
}

/**
 * Anthropic returns ISO-8601 timestamps for reset times, not durations.
 * Convert to "ms until reset" at parse time so the terminal UI (which expects
 * a duration) works without changes.
 */
function parseIsoToMsUntilReset(iso: string | null): number | null {
  if (!iso) return null;
  const resetAt = Date.parse(iso);
  if (isNaN(resetAt)) return null;
  return Math.max(0, resetAt - Date.now());
}

/**
 * Anthropic-specific headers beyond the base requests/tokens buckets:
 * separate input-token and output-token limits, plus the request ID.
 *
 * Headers captured:
 *   anthropic-ratelimit-input-tokens-limit
 *   anthropic-ratelimit-input-tokens-remaining
 *   anthropic-ratelimit-input-tokens-reset     (ISO-8601)
 *   anthropic-ratelimit-output-tokens-limit
 *   anthropic-ratelimit-output-tokens-remaining
 *   anthropic-ratelimit-output-tokens-reset    (ISO-8601)
 *   request-id
 */
export interface AnthropicExtendedHeaders {
  inputTokensLimit: number | null;
  inputTokensRemaining: number | null;
  inputTokensResetMs: number | null;
  inputTokensResetRaw: string | null;
  outputTokensLimit: number | null;
  outputTokensRemaining: number | null;
  outputTokensResetMs: number | null;
  outputTokensResetRaw: string | null;
  requestId: string | null;
}

/**
 * Parse Anthropic rate-limit headers into the same shape as GroqRateLimitHeaders
 * so the terminal quota display works without changes.
 *
 * Anthropic headers:
 *   anthropic-ratelimit-requests-limit / -remaining / -reset (ISO-8601)
 *   anthropic-ratelimit-tokens-limit   / -remaining / -reset (ISO-8601)
 */
export function parseAnthropicRateLimitHeaders(
  headers: Headers | Record<string, string>
): GroqRateLimitHeaders {
  const get = (key: string): string | null =>
    headers instanceof Headers
      ? headers.get(key)
      : ((headers)[key] ?? null);

  const num = (key: string): number | null => {
    const v = get(key);
    if (v === null) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  };

  const resetRequestsRaw = get('anthropic-ratelimit-requests-reset');
  const resetTokensRaw = get('anthropic-ratelimit-tokens-reset');

  return {
    limitRequests: num('anthropic-ratelimit-requests-limit'),
    limitTokens: num('anthropic-ratelimit-tokens-limit'),
    remainingRequests: num('anthropic-ratelimit-requests-remaining'),
    remainingTokens: num('anthropic-ratelimit-tokens-remaining'),
    resetRequestsMs: parseIsoToMsUntilReset(resetRequestsRaw),
    resetTokensMs: parseIsoToMsUntilReset(resetTokensRaw),
    resetRequestsRaw,
    resetTokensRaw,
  };
}

/** Parse the Anthropic-specific extended headers (input/output token buckets + request ID). */
export function parseAnthropicExtendedHeaders(
  headers: Headers | Record<string, string>
): AnthropicExtendedHeaders {
  const get = (key: string): string | null =>
    headers instanceof Headers
      ? headers.get(key)
      : ((headers)[key] ?? null);

  const num = (key: string): number | null => {
    const v = get(key);
    if (v === null) return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  };

  const inputResetRaw = get('anthropic-ratelimit-input-tokens-reset');
  const outputResetRaw = get('anthropic-ratelimit-output-tokens-reset');

  return {
    inputTokensLimit: num('anthropic-ratelimit-input-tokens-limit'),
    inputTokensRemaining: num('anthropic-ratelimit-input-tokens-remaining'),
    inputTokensResetMs: parseIsoToMsUntilReset(inputResetRaw),
    inputTokensResetRaw: inputResetRaw,
    outputTokensLimit: num('anthropic-ratelimit-output-tokens-limit'),
    outputTokensRemaining: num('anthropic-ratelimit-output-tokens-remaining'),
    outputTokensResetMs: parseIsoToMsUntilReset(outputResetRaw),
    outputTokensResetRaw: outputResetRaw,
    requestId: get('request-id') ?? get('x-request-id'),
  };
}

export function supplementWithModelLimits(
  headers: GroqRateLimitHeaders,
  modelLimits?: { rpm: number; rpd: number; tpm: number; tpd: number | null }
): GroqRateLimitInfo {
  return {
    ...headers,
    modelRpm: modelLimits?.rpm ?? null,
    modelRpd: modelLimits?.rpd ?? null,
    modelTpm: modelLimits?.tpm ?? null,
    modelTpd: modelLimits?.tpd ?? null,
  };
}

/**
 * A single rate-limit bucket: remaining and limit counts, with an optional
 * reset duration (ms) for time-based estimation.
 */
export interface RateLimitBucket {
  label: string;
  remaining: number | null;
  limit: number | null;
  /** ms until bucket refills — present when the provider returns a reset header. */
  resetMs?: number | null;
}

/** Normalised rate-limit state for any provider, as an ordered list of buckets. */
export type RateLimitSnapshot = RateLimitBucket[];

/** Convert the Groq-specific header struct into the generic snapshot format. */
export function groqHeadersToSnapshot(h: GroqRateLimitHeaders): RateLimitSnapshot {
  return [
    { label: 'R', remaining: h.remainingRequests, limit: h.limitRequests, resetMs: h.resetRequestsMs },
    { label: 'T', remaining: h.remainingTokens, limit: h.limitTokens, resetMs: h.resetTokensMs },
  ];
}

function headerNum(headers: Headers | Record<string, string>, key: string): number | null {
  const v = headers instanceof Headers ? headers.get(key) : (headers[key] ?? null);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

/**
 * Parse Mistral minute-level rate-limit headers into a snapshot.
 * Headers: x-ratelimit-{limit,remaining}-{req,tokens}-minute
 */
export function parseMistralRateLimitSnapshot(
  headers: Headers | Record<string, string>
): RateLimitSnapshot {
  const rr = headerNum(headers, 'x-ratelimit-remaining-req-minute');
  const lr = headerNum(headers, 'x-ratelimit-limit-req-minute');
  const rt = headerNum(headers, 'x-ratelimit-remaining-tokens-minute');
  const lt = headerNum(headers, 'x-ratelimit-limit-tokens-minute');
  const buckets: RateLimitSnapshot = [];
  if (rr !== null || lr !== null) buckets.push({ label: 'Rm', remaining: rr, limit: lr });
  if (rt !== null || lt !== null) buckets.push({ label: 'Tm', remaining: rt, limit: lt });
  return buckets;
}

/**
 * Parse Cerebras per-minute/hour/day rate-limit headers into a snapshot.
 * Headers: x-ratelimit-{limit,remaining}-{requests,tokens}-{minute,hour,day}
 */
export function parseCerebrasRateLimitSnapshot(
  headers: Headers | Record<string, string>
): RateLimitSnapshot {
  const granularities = ['minute', 'hour', 'day'] as const;
  const suffix = { minute: 'm', hour: 'h', day: 'd' } as const;
  const buckets: RateLimitSnapshot = [];
  for (const gran of granularities) {
    const rr = headerNum(headers, `x-ratelimit-remaining-requests-${gran}`);
    const lr = headerNum(headers, `x-ratelimit-limit-requests-${gran}`);
    const rt = headerNum(headers, `x-ratelimit-remaining-tokens-${gran}`);
    const lt = headerNum(headers, `x-ratelimit-limit-tokens-${gran}`);
    if (rr !== null || lr !== null) buckets.push({ label: `R${suffix[gran]}`, remaining: rr, limit: lr });
    if (rt !== null || lt !== null) buckets.push({ label: `T${suffix[gran]}`, remaining: rt, limit: lt });
  }
  return buckets;
}

/** Extract rate-limit ceiling values from Groq/OpenAI-compat headers (dynamic reset window). */
export function extractGroqRateLimitBuckets(h: GroqRateLimitHeaders): Record<string, ObservedRateLimitBucket> {
  const result: Record<string, ObservedRateLimitBucket> = {};
  if (h.limitRequests !== null) result['requests'] = { limit: h.limitRequests, intervalMs: h.resetRequestsMs };
  if (h.limitTokens !== null) result['tokens'] = { limit: h.limitTokens, intervalMs: h.resetTokensMs };
  return result;
}

/** Extract rate-limit ceiling values from Mistral per-minute headers. */
export function extractMistralRateLimitBuckets(headers: Headers | Record<string, string>): Record<string, ObservedRateLimitBucket> {
  const result: Record<string, ObservedRateLimitBucket> = {};
  const lr = headerNum(headers, 'x-ratelimit-limit-req-minute');
  const lt = headerNum(headers, 'x-ratelimit-limit-tokens-minute');
  if (lr !== null) result['requests-per-minute'] = { limit: lr, intervalMs: 60_000 };
  if (lt !== null) result['tokens-per-minute'] = { limit: lt, intervalMs: 60_000 };
  return result;
}

/** Extract rate-limit ceiling values from Cerebras per-minute/hour/day headers. */
export function extractCerebrasRateLimitBuckets(headers: Headers | Record<string, string>): Record<string, ObservedRateLimitBucket> {
  const result: Record<string, ObservedRateLimitBucket> = {};
  for (const [name, ms] of [['minute', 60_000], ['hour', 3_600_000], ['day', 86_400_000]] as const) {
    const lr = headerNum(headers, `x-ratelimit-limit-requests-${name}`);
    const lt = headerNum(headers, `x-ratelimit-limit-tokens-${name}`);
    if (lr !== null) result[`requests-per-${name}`] = { limit: lr, intervalMs: ms };
    if (lt !== null) result[`tokens-per-${name}`] = { limit: lt, intervalMs: ms };
  }
  return result;
}

/**
 * Dispatch rate-limit bucket extraction by provider.
 * Covers groq, mistral, cerebras, and OpenAI-compat providers sharing the Groq header shape.
 */
export function extractOpenAICompatRateLimitBuckets(
  providerId: string,
  headers: Headers,
): Record<string, ObservedRateLimitBucket> {
  if (providerId === 'mistral') return extractMistralRateLimitBuckets(headers);
  if (providerId === 'cerebras') return extractCerebrasRateLimitBuckets(headers);
  return extractGroqRateLimitBuckets(parseGroqRateLimitHeaders(headers));
}

/** Extract rate-limit ceiling values from Anthropic headers (per-minute rolling windows). */
export function extractAnthropicRateLimitBuckets(
  base: GroqRateLimitHeaders,
  extended: AnthropicExtendedHeaders,
): Record<string, ObservedRateLimitBucket> {
  const result: Record<string, ObservedRateLimitBucket> = {};
  if (base.limitRequests !== null) result['requests'] = { limit: base.limitRequests, intervalMs: 60_000 };
  if (base.limitTokens !== null) result['tokens'] = { limit: base.limitTokens, intervalMs: 60_000 };
  if (extended.inputTokensLimit !== null) result['input-tokens'] = { limit: extended.inputTokensLimit, intervalMs: 60_000 };
  if (extended.outputTokensLimit !== null) result['output-tokens'] = { limit: extended.outputTokensLimit, intervalMs: 60_000 };
  return result;
}
