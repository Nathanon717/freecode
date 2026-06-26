# src/providers/adapters/openai-compat.ts - OpenAI-Compatible Adapter

**Role:** Creates `@ai-sdk/openai` provider factories for registry providers and Ollama, applies per-provider request quirks, captures rate-limit headers, auto-retries short 429 waits, and captures raw usage metadata from OpenAI-compatible responses. Pure body transforms live in [openai-compat-sse](openai-compat-sse.md), the retry loop in [adapter-http-retry](adapter-http-retry.md), and the capture stores in [adapter-usage-capture](adapter-usage-capture.md).

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

formatOpenAICompatHttpError(providerName: string, response: Response): Promise<string | null>

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
- `headers` from `getOpenAICompatProviderHeaders()`, currently OpenRouter `HTTP-Referer` and `X-Title`
- optional custom `fetch` for quota capture, OpenAI temperature stripping, raw usage capture, or provider HTTP error formatting

The custom fetch applies per-provider request-body quirks before sending: stripping `temperature` for OpenAI models that disallow it, forcing Mistral non-streaming (and Codestral system injection), and setting `parallel_tool_calls:false` for providers flagged via `setParallelToolsDisabled()`. The body transforms it relies on (`mistralJsonToSse`, tool-call SSE normalization) live in [openai-compat-sse](openai-compat-sse.md).

Non-OK HTTP responses are parsed for OpenAI-compatible `{ error: { message, code } }` bodies before throwing so callers see provider-specific API key, credit, model, or rate-limit details instead of a generic SDK error.

## 429/503 Auto-Retry

The custom fetch delegates retries to [`fetchWithRetry`](adapter-http-retry.md), which retries 429/503 up to 5 times with bounded backoff capped at `config.retryMaxWaitSeconds` (default 10). On each retryable response the adapter's `onRetryableResponse` callback parses the rate-limit snapshot and pushes it to the quota sink registered via `registerQuotaUpdateSink()`. Retry-countdown rendering is owned by the CLI (see [adapter-http-retry](adapter-http-retry.md)).

## Rate-Limit Header Capture

When `DEBUG_QUOTA !== "0"`, the wrapped fetch parses `x-ratelimit-*` headers for Groq, Mistral, and Cerebras and stores them in a `HeaderSnapshotStore` from [adapter-usage-capture](adapter-usage-capture.md), keyed by provider ID. `agent/loop.ts` reads that snapshot after a streamed turn.

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
