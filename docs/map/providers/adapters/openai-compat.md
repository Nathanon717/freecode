# src/providers/adapters/openai-compat.ts - OpenAI-Compatible Adapter

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Provider-agnostic pipeline for **every** registry provider (Anthropic included) plus Ollama: parse body → apply profile quirks → fetch with retry → capture rate-limit headers → throw HTTP errors → convert/normalize response, with zero `if (id === 'x')` branches. Provider-specific pieces live elsewhere: static traits in [quirks](openai-compat-quirks.md), body transforms in [request](openai-compat-request.md)/[sse](openai-compat-sse.md), retry + error formatting in [http-retry](adapter-http-retry.md), capture stores in [usage-capture](adapter-usage-capture.md). There is no separate Anthropic adapter; Anthropic is a catalog entry (`baseUrl: "https://api.anthropic.com/v1"`) with no quirk profile, so it runs the default pipeline with `captureRateLimits` off.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
registerQuotaUpdateSink(fn: QuotaUpdateSink | null): void

interface CapturedProviderUsage {
  providerId: string;
  responseId?: string;
  model?: string;
  usage: unknown;
  source: 'json' | 'sse';
  capturedAt: number;
}

setParallelToolsDisabled(providerId: string, disabled: boolean): void

/**
 * Return the headers captured from the most recent HTTP response for the given
 * provider, or null if none have been captured yet.
 */
getLastCapturedHeaders(providerId: string): RateLimitSnapshot | null

beginProviderUsageCapture(providerId: string): void

endProviderUsageCapture(providerId: string): Promise<CapturedProviderUsage[]>

formatCapturedProviderUsages(usages: CapturedProviderUsage[] | null | undefined): string | null

createOpenAICompatProvider(providerConfig: ProviderConfig): OpenAIProvider

createOllamaProvider(): OpenAIProvider
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`store/call-log.ts`](../../store/call-log.md) ×5, [`util/guards.ts`](../../util/guards.md) ×4, [`providers/quota/headers.ts`](../quota/headers.md) ×3, [`config/index.ts`](../../config/index.md) ×2, [`providers/adapters/adapter-http-retry.ts`](adapter-http-retry.md) ×2, [`providers/adapters/adapter-usage-capture.ts`](adapter-usage-capture.md) ×2, [`providers/adapters/openai-compat-sse.ts`](openai-compat-sse.md) ×2, [`providers/adapters/openai-compat-quirks.ts`](openai-compat-quirks.md) ×1, [`providers/adapters/openai-compat-request.ts`](openai-compat-request.md) ×1, [`providers/model-data.ts`](../model-data.md) ×1, [`providers/types.ts`](../types.md) ×1
- **Imported by:** [`agent/loop.ts`](../../agent/loop.md) ×6, [`agent/usage-finalize.ts`](../../agent/usage-finalize.md) ×3, [`cli/command-dispatcher.ts`](../../cli/command-dispatcher.md) ×1, [`providers/provider-registry.ts`](../provider-registry.md) ×1

## Tests

`tests/providers/adapters/openai-compat.test.ts`. 4 other test files reference it.

## Budget

254 / 500 lines (246 to spare).

## Env

`DEBUG_QUOTA`, `DEBUG_TOOLS`
<!-- END GENERATED MAP FACTS -->

## `createOpenAICompatProvider`

Calls `createOpenAI()` with:

- `baseURL` from `providerConfig.baseUrl`
- `apiKey` from `process.env[providerConfig.apiKeyEnvVar]`, then `loadConfig().providers[providerConfig.id]?.apiKey`, then `placeholder`
- `headers` from the provider's `staticHeaders` quirk profile entry (e.g. OpenRouter `HTTP-Referer`/`X-Title`)
- a custom `fetch` that runs the fixed pipeline

The custom `fetch` pipeline (in order):

1. Parse the request body as JSON once
2. Call `profile.transformRequest(body)` if the provider has one — returns the transformed body and an optional `forcedNonStream` flag
3. Call `injectParallelToolCallsFalse(body)` when the provider is flagged via `setParallelToolsDisabled()` (runtime toggle, not a profile entry)
4. Stringify the body once and send via `fetchWithRetry` (see [adapter-http-retry](adapter-http-retry.md))
5. Capture rate-limit headers if `profile.captureRateLimits` is set, using `profile.parseRateLimitSnapshot`
6. Call `formatOpenAICompatHttpError()` and throw on non-OK responses; provider-specific error hints come from `profile.httpErrorHint`
7. Convert JSON response to SSE when `forcedNonStream` was set
8. Normalize tool-call SSE via `normalizeOpenAICompatToolCallResponse` from [openai-compat-sse](openai-compat-sse.md)
9. Capture raw usage metadata via `captureProviderUsage`

## 429/503 Auto-Retry

The custom fetch delegates retries to [`fetchWithRetry`](adapter-http-retry.md), which retries 429/503 up to 5 times. A server `retry-after` is honored in full; `config.retryMaxWaitSeconds` (default 120) bounds only the self-computed backoff used when no `retry-after` is sent. Concurrent calls share a rate-limit gate keyed by the `providerId` passed here. On each retryable response the adapter's `onRetryableResponse` callback parses the rate-limit snapshot and pushes it to the quota sink registered via `registerQuotaUpdateSink()`. Retry-countdown rendering is owned by the CLI (see [adapter-http-retry](adapter-http-retry.md)).

## Rate-Limit Header Capture

When `DEBUG_QUOTA !== "0"` and the provider's quirk profile has `captureRateLimits: true`, the wrapped fetch calls `profile.parseRateLimitSnapshot` on response headers and stores the result in a `HeaderSnapshotStore` from [adapter-usage-capture](adapter-usage-capture.md), keyed by provider ID. The same callback fires on each retryable response to push live snapshots to the quota sink. `agent/loop.ts` reads that snapshot after a streamed turn. Providers with `captureRateLimits` set: Groq, Mistral, Cerebras (see [openai-compat-quirks](openai-compat-quirks.md)).

## Usage Capture

For OpenAI-compatible providers, the wrapped fetch clones responses while an agent turn is inside `beginProviderUsageCapture()` / `endProviderUsageCapture()`, backed by a `UsageCaptureStore` from [adapter-usage-capture](adapter-usage-capture.md).

The parser reads:

- top-level JSON `usage`
- Responses-style JSON `response.usage`
- SSE `data:` chunks with either shape, keeping the last usage-bearing chunk

Captured usage is intentionally not interpreted for billing; the CLI prints the raw JSON returned by the provider.

## `createOllamaProvider`

Returns an OpenAI-compatible provider pointed at:

```text
http://localhost:11434/v1
```

with API key `ollama`.
