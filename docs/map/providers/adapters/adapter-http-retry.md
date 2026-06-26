# src/providers/adapters/adapter-http-retry.ts - Adapter HTTP Retry/Backoff

**Role:** HTTP retry/backoff for OpenAI-compatible providers. Retries 429/503 responses with a bounded wait and surfaces "retrying in Ns" status through a sink, so the CLI layer — not the adapter — owns how it is rendered.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface RetryBannerInfo {
  name: string;
  label: string;
  targetMs: number;
}

registerRetryBannerSink(fn: RetryBannerSetter | null): void

parseRetryAfterMs(value: string | null): number

interface FetchWithRetryOptions {
  /** Display name used in the retry banner (e.g. "OpenRouter"). */
  providerName: string;
  /** Upper bound on any single wait, in milliseconds. */
  maxWaitMs: number;
  /** Invoked with the headers of each retryable (429/503) response, before waiting. */
  onRetryableResponse?: (headers: Headers) => void;
}

fetchWithRetry(input: string | URL | Request, init: RequestInit | undefined, options: FetchWithRetryOptions): Promise<Response>
```
<!-- END GENERATED EXPORTS -->

## `fetchWithRetry`

Fetches with bounded exponential backoff on HTTP 429/503. Honors a `retry-after` header when present, otherwise backs off as `2^attempt` seconds, each wait capped at `options.maxWaitMs`. Retries up to 5 times, then returns the last response as-is. `options.onRetryableResponse(headers)` is invoked with each retryable response's headers before waiting — the OpenAI-compatible adapter uses it to capture rate-limit snapshots.

## Retry Banner Sink

During each wait, `RetryBannerInfo` (with the wait's target time) is pushed to the registered sink, then `null` is pushed when the wait ends. The adapter emits only target times; rendering belongs to the CLI:

- TTY: `src/index.ts` registers `terminal-ui`'s `setRetryBanner`, drawn by the footer's 1s refresh.
- Non-TTY: `src/index.ts` registers the default [stdout retry sink](../../cli/stdout-retry-sink.md).
- Scripted with `FREECODE_RETRY_STATUS_FILE`: `src/index.ts` registers a writer that serializes the info to that file.

When no sink is registered the wait still happens; only the countdown display is skipped.

## Read When

Changing retry/backoff policy (attempts, caps, which status codes retry) or how retry status is surfaced to the UI.
