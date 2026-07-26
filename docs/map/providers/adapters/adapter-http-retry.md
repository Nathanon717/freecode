# src/providers/adapters/adapter-http-retry.ts - Adapter HTTP Retry/Backoff

**Role:** HTTP retry/backoff and error formatting for **every** provider adapter — both [openai-compat](openai-compat.md) and [anthropic](anthropic.md) route their `customFetch` through `fetchWithRetry`, so 429/503 handling is automatic for any LLM call the app makes. Surfaces "retrying in Ns" status through a sink, so the CLI layer — not the adapter — owns how it is rendered. Also owns the per-provider rate-limit gate shared across concurrent calls. Also owns `formatOpenAICompatHttpError`, which parses non-OK responses for provider-specific `{ error: { message, code } }` bodies and formats a human-readable error string; accepts an optional `httpErrorHint` callback for per-provider extra context (e.g. OpenRouter 429 guidance).

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
  /** Keys the shared rate-limit gate. All calls to one provider must pass the same id. */
  providerId: string;
  /** Display name used in the retry banner (e.g. "OpenRouter"). */
  providerName: string;
  /** Upper bound on self-computed backoff, in ms. Does not shorten a server `retry-after`. */
  maxWaitMs: number;
  /** Invoked with the headers of each retryable (429/503) response, before waiting. */
  onRetryableResponse?: (headers: Headers) => void;
}

formatOpenAICompatHttpError(providerName: string, response: Response, httpErrorHint?: ((response: Response) => string | null) | undefined): Promise<string | null>

fetchWithRetry(input: string | URL | Request, init: RequestInit | undefined, options: FetchWithRetryOptions): Promise<Response>
```
<!-- END GENERATED EXPORTS -->

## `fetchWithRetry`

Fetches with backoff on HTTP 429/503, retrying up to 5 times before returning the last response as-is. `options.onRetryableResponse(headers)` is invoked with each retryable response's headers before waiting — the OpenAI-compatible adapter uses it to capture rate-limit snapshots.

Wait length: a server `retry-after` is honored **in full**, however long. `options.maxWaitMs` (`config.retryMaxWaitSeconds`, default 120) bounds only the `2^attempt` second backoff invented when the server sends no `retry-after`. It deliberately does **not** clamp `retry-after` — retrying earlier than the server allows is guaranteed to 429 again, which was the cause of a retry-spam bug.

Because that makes a wait potentially day-scale, every wait is abortable via `init.signal` — the caller's own `AbortSignal` rejects the sleep rather than letting it outlast the deadline the caller thinks it has. `maxWaitMs` is therefore not a safety bound on total wait time; the caller's signal is.

## Shared Rate-Limit Gate

A module-level `Map<providerId, notBeforeMs>` holds a "do not send before" time per provider. A rate limit belongs to the API key, not to one request, so any call that sees a 429 publishes the hold before waiting it out, and every call awaits the gate before sending. This is what makes concurrent callers sharing one key (e.g. `scripts/diagnostics/map-drift.ts` at `--concurrency 8`) back off *once together* instead of each burning its own 429 and then all waking simultaneously. Holds only move forward, and the gate is re-read during a wait so a hold extended mid-wait still applies.

`options.providerId` keys the gate — all calls to one provider must pass the same id, or they get independent gates and the coordination is lost.

## Retry Banner Sink

During each wait, `RetryBannerInfo` (with the wait's target time) is pushed to the registered sink, then `null` is pushed when the wait ends. The adapter emits only target times; rendering belongs to the CLI:

- TTY: `src/index.ts` registers `footer-status`'s `setRetryBanner`, drawn by the footer's 1s refresh.
- Non-TTY: `src/index.ts` registers the default [stdout retry sink](../../cli/stdout-retry-sink.md).
- Scripted with `FREECODE_RETRY_STATUS_FILE`: `src/index.ts` registers a writer that serializes the info to that file.

When no sink is registered the wait still happens; only the countdown display is skipped.

## `formatOpenAICompatHttpError`

Reads the response body (non-consuming — uses `.clone()`) and tries to parse an OpenAI-compatible `{ error: { message, code } }` structure. On a 429 with a `retry-after` header, appends "Retry after Ns." using `parseRetryAfterMs` internally (no duplicate parse logic). Appends the result of `httpErrorHint?.(response)` when provided. Returns `null` for OK responses.

## Read When

Changing retry/backoff policy (attempts, caps, which status codes retry), how concurrent calls coordinate on a shared rate limit, how retry status is surfaced to the UI, or how non-OK HTTP responses are formatted for callers.
