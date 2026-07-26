// HTTP retry/backoff and HTTP error formatting, shared by every provider adapter.
// Retries 429/503 responses, surfaces "retrying in Ns" status through a sink so the
// CLI layer — not this adapter — owns how it is rendered, and holds a per-provider
// gate so concurrent calls sharing one API key back off together rather than each
// discovering the same limit on its own.

import { isRecord } from '../../util/guards.js';

export interface RetryBannerInfo {
  name: string;
  label: string;
  targetMs: number;
}

type RetryBannerSetter = (info: RetryBannerInfo | null) => void;

let retryBannerSink: RetryBannerSetter | null = null;

export function registerRetryBannerSink(fn: RetryBannerSetter | null): void {
  retryBannerSink = fn;
}

export function parseRetryAfterMs(value: string | null): number {
  if (!value) return 1000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds) * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(1000, date - Date.now());
  return 1000;
}

/**
 * Sleep with the countdown banner up. A server `retry-after` is honored in full and
 * can be day-scale, so the sleep must be abortable — otherwise a caller's own
 * timeout or cancellation cannot interrupt a wait longer than it.
 */
async function notifyAndWait(
  name: string,
  label: string,
  waitMs: number,
  signal?: AbortSignal | null,
): Promise<void> {
  signal?.throwIfAborted();
  retryBannerSink?.({ name, label, targetMs: Date.now() + waitMs });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, waitMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          // Node's AbortError/TimeoutError DOMExceptions are Errors, so the caller's
          // own reason survives; the wrap only covers a non-Error abort reason.
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        },
        { once: true },
      );
    });
  } finally {
    retryBannerSink?.(null);
  }
}

/**
 * Per-provider "do not send before" timestamps. A rate limit is a property of the
 * API key, not of one request, so a 429 seen by any in-flight call has to stop the
 * others too — otherwise N concurrent workers each burn their own 429 and then all
 * wake together to do it again.
 */
const providerGates = new Map<string, number>();

/** Push a provider's gate forward. Never pulls it earlier. */
function holdProvider(providerId: string, untilMs: number): void {
  if (untilMs > (providerGates.get(providerId) ?? 0)) providerGates.set(providerId, untilMs);
}

/**
 * Wait out a hold placed by any concurrent call. Re-reads the gate each pass so a
 * hold extended mid-wait still applies. The 50ms floor keeps a timer that fires a
 * hair early from spinning out an extra zero-length banner.
 */
async function awaitGate(
  providerId: string,
  providerName: string,
  label: string,
  signal?: AbortSignal | null,
): Promise<void> {
  for (;;) {
    const remaining = (providerGates.get(providerId) ?? 0) - Date.now();
    if (remaining <= 50) return;
    await notifyAndWait(providerName, label, remaining, signal);
  }
}

export interface FetchWithRetryOptions {
  /** Keys the shared rate-limit gate. All calls to one provider must pass the same id. */
  providerId: string;
  /** Display name used in the retry banner (e.g. "OpenRouter"). */
  providerName: string;
  /** Upper bound on self-computed backoff, in ms. Does not shorten a server `retry-after`. */
  maxWaitMs: number;
  /** Invoked with the headers of each retryable (429/503) response, before waiting. */
  onRetryableResponse?: (headers: Headers) => void;
}

function humanRetryAfter(header: string): string {
  const seconds = Math.ceil(parseRetryAfterMs(header) / 1000);
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

/**
 * Format a non-OK OpenAI-compatible HTTP response into a human-readable error string.
 * Pass an optional `httpErrorHint` to append provider-specific guidance (e.g. OpenRouter 429 text).
 */
export async function formatOpenAICompatHttpError(
  providerName: string,
  response: Response,
  httpErrorHint?: (response: Response) => string | null,
): Promise<string | null> {
  if (response.ok) return null;

  const body = await response.clone().text().catch(() => '');
  let providerMessage: string | undefined;
  let providerCode: string | number | undefined;

  if (body) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (isRecord(parsed) && isRecord(parsed.error)) {
        providerMessage = typeof parsed.error.message === 'string' ? parsed.error.message : undefined;
        providerCode =
          typeof parsed.error.code === 'string' || typeof parsed.error.code === 'number'
            ? parsed.error.code
            : undefined;
      }
    } catch {
      providerMessage = body.slice(0, 500);
    }
  }

  const status = `${response.status} ${response.statusText}`.trim();
  const retryHeader = response.headers.get('retry-after');
  const retryHint = response.status === 429 && retryHeader ? ` Retry after ${humanRetryAfter(retryHeader)}.` : '';
  const providerHint = httpErrorHint?.(response) ?? '';
  const details = providerMessage
    ? `${providerMessage}${providerCode !== undefined ? ` (code: ${providerCode})` : ''}`
    : body.slice(0, 500);
  return details
    ? `${providerName} HTTP ${status}: ${details}${retryHint}${providerHint}`
    : `${providerName} HTTP ${status}${retryHint}${providerHint}`;
}

/**
 * Fetch with backoff on 429/503, coordinated across every concurrent call to the
 * same provider. A server `retry-after` is an instruction, not a suggestion, so it
 * is honored in full; `maxWaitMs` bounds only the 2^attempt backoff we invent when
 * the server gives us nothing. Retries up to 5 times, then returns the last
 * response as-is.
 */
export async function fetchWithRetry(
  input: Parameters<typeof globalThis.fetch>[0],
  init: Parameters<typeof globalThis.fetch>[1],
  options: FetchWithRetryOptions,
): Promise<Response> {
  // The caller's own signal bounds every wait below; without it a long retry-after
  // would outlast the timeout or cancellation the caller thinks it has.
  const signal = init?.signal;
  await awaitGate(options.providerId, options.providerName, 'rate-limited', signal);
  let response = await globalThis.fetch(input, init);
  for (let attempt = 0; (response.status === 429 || response.status === 503) && attempt < 5; attempt++) {
    const retryHeader = response.headers.get('retry-after');
    const is503 = response.status === 503;
    const waitMs = retryHeader
      ? parseRetryAfterMs(retryHeader)
      : Math.min(2 ** attempt * 1000, options.maxWaitMs);
    const label = is503 && !retryHeader ? 'unavailable' : 'rate-limited';
    options.onRetryableResponse?.(response.headers);
    // Publish the hold before waiting it out, so calls that have not sent yet park
    // instead of walking into the same limit.
    holdProvider(options.providerId, Date.now() + waitMs);
    await notifyAndWait(options.providerName, label, waitMs, signal);
    // Only waits again if another call extended the hold while we slept.
    await awaitGate(options.providerId, options.providerName, label, signal);
    response = await globalThis.fetch(input, init);
  }
  return response;
}
