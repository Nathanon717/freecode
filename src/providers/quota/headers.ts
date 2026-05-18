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
      : ((headers as Record<string, string>)[key] ?? null);

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
