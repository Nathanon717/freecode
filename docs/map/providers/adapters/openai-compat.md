# src/providers/adapters/openai-compat.ts - OpenAI-Compatible Adapter

**Role:** Provider-agnostic orchestration skeleton for all OpenAI-compatible registry providers and Ollama. Runs a fixed pipeline — parse body → apply profile quirks → fetch with retry → capture rate-limit headers → throw HTTP errors → convert/normalize response — with zero `if (id === 'x')` branches. Per-provider static traits (headers, request transforms, rate-limit capture, error hints) live entirely in [openai-compat-quirks](openai-compat-quirks.md). Pure request-body transforms live in [openai-compat-request](openai-compat-request.md) and [openai-compat-sse](openai-compat-sse.md). The retry loop and HTTP error formatter live in [adapter-http-retry](adapter-http-retry.md). Capture stores live in [adapter-usage-capture](adapter-usage-capture.md).

> **Intentional asymmetry with `anthropic.ts`:** `anthropic.ts` is a single-provider adapter wired directly to the Anthropic SDK — it has one tenant and needs no routing layer. `openai-compat.ts` is a multi-tenant router shared by every OpenAI-compatible provider. Do not "harmonize" them. The quirks map and fixed pipeline here are load-bearing; they would only add noise in a single-tenant file.

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

getLastCapturedHeaders(providerId: string): RateLimitSnapshot | null

beginProviderUsageCapture(providerId: string): void

endProviderUsageCapture(providerId: string): Promise<CapturedProviderUsage[]>

formatCapturedProviderUsages(usages: CapturedProviderUsage[] | null | undefined): string | null

getOpenAICompatProviderHeaders(providerId: string): Record<string, string> | undefined

createOpenAICompatProvider(providerConfig: ProviderConfig): OpenAIProvider

createOllamaProvider(): OpenAIProvider
```
<!-- END GENERATED EXPORTS -->

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

The custom fetch delegates retries to [`fetchWithRetry`](adapter-http-retry.md), which retries 429/503 up to 5 times with bounded backoff capped at `config.retryMaxWaitSeconds` (default 10). On each retryable response the adapter's `onRetryableResponse` callback parses the rate-limit snapshot and pushes it to the quota sink registered via `registerQuotaUpdateSink()`. Retry-countdown rendering is owned by the CLI (see [adapter-http-retry](adapter-http-retry.md)).

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
