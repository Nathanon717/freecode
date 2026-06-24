// HTTP retry/backoff for OpenAI-compatible providers. Retries 429/503 responses
// with a bounded wait, and surfaces "retrying in Ns" status through a sink so
// the CLI layer — not this adapter — owns how it is rendered.

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

async function notifyAndWait(name: string, label: string, waitMs: number): Promise<void> {
  retryBannerSink?.({ name, label, targetMs: Date.now() + waitMs });
  try {
    await new Promise<void>(resolve => setTimeout(resolve, waitMs));
  } finally {
    retryBannerSink?.(null);
  }
}

export interface FetchWithRetryOptions {
  /** Display name used in the retry banner (e.g. "OpenRouter"). */
  providerName: string;
  /** Upper bound on any single wait, in milliseconds. */
  maxWaitMs: number;
  /** Invoked with the headers of each retryable (429/503) response, before waiting. */
  onRetryableResponse?: (headers: Headers) => void;
}

/**
 * Fetch with bounded exponential backoff on 429/503. Honors a `retry-after`
 * header when present, otherwise backs off as 2^attempt seconds, each capped at
 * maxWaitMs. Retries up to 5 times, then returns the last response as-is.
 */
export async function fetchWithRetry(
  input: Parameters<typeof globalThis.fetch>[0],
  init: Parameters<typeof globalThis.fetch>[1],
  options: FetchWithRetryOptions,
): Promise<Response> {
  let response = await globalThis.fetch(input, init);
  for (let attempt = 0; (response.status === 429 || response.status === 503) && attempt < 5; attempt++) {
    const retryHeader = response.headers.get('retry-after');
    const is503 = response.status === 503;
    const rawDelayMs = retryHeader
      ? parseRetryAfterMs(retryHeader)
      : Math.min(2 ** attempt * 1000, options.maxWaitMs);
    const waitMs = Math.min(rawDelayMs, options.maxWaitMs);
    const label = is503 && !retryHeader ? 'unavailable' : 'rate-limited';
    options.onRetryableResponse?.(response.headers);
    await notifyAndWait(options.providerName, label, waitMs);
    response = await globalThis.fetch(input, init);
  }
  return response;
}
