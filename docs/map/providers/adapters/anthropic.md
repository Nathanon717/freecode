# src/providers/adapters/anthropic.ts - Anthropic Adapter

**Role:** Creates native Anthropic AI SDK provider factories, captures Anthropic rate-limit headers, and extracts streamed usage metadata for cost estimates and raw usage display. The per-provider header snapshot and usage-capture stores come from [adapter-usage-capture](adapter-usage-capture.md), shared with the OpenAI-compatible adapter.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getLastCapturedAnthropicHeaders(providerId: string): RateLimitSnapshot | null

parseAnthropicUsageFromSse(body: string, inferenceGeo?: string | undefined): AnthropicTokenUsage | null

beginAnthropicUsageCapture(providerId: string): void

endAnthropicUsageCapture(providerId: string): Promise<AnthropicTokenUsage | null>

mergeAnthropicUsages(usages: AnthropicTokenUsage[]): AnthropicTokenUsage | null

createAnthropicProvider(providerConfig: ProviderConfig): AnthropicProvider
```
<!-- END GENERATED EXPORTS -->

## Provider Creation

`createAnthropicProvider()` loads the API key from:

1. `process.env[providerConfig.apiKeyEnvVar]`
2. `loadConfig().providers[providerConfig.id]?.apiKey`

It wraps a custom fetch before passing it to `createAnthropic()`. That fetch issues its request through [`fetchWithRetry`](adapter-http-retry.md) rather than `globalThis.fetch`, so Anthropic gets the same automatic 429/503 backoff, `retry-after` handling, retry-countdown banner, and shared per-provider rate-limit gate as the OpenAI-compatible providers. Only the final response reaches the usage/header/call-log branches below, so a retried 429 is not logged as an error.

Session ingress tokens (`sk-ant-si-*`) are JWTs, so the fetch swaps `x-api-key` for an `Authorization: Bearer` header.

## Header Capture

When `DEBUG_QUOTA !== "0"`, the wrapped fetch parses Anthropic rate-limit headers through `parseAnthropicRateLimitHeaders()` and logs extended Anthropic-specific quota details from `parseAnthropicExtendedHeaders()`.

## Usage Capture

The agent loop calls `beginAnthropicUsageCapture()` before `streamText()` and `endAnthropicUsageCapture()` after it completes or fails.

During that window, every Anthropic response is cloned and parsed as JSON SSE. Usage is read from:

- `message_start.message.usage`
- `message_delta.usage`

Captured fields include input/output tokens, cache creation/read tokens, optional 5-minute and 1-hour cache write buckets, server tool usage, and `inference_geo` from the request body when present. `agent/loop.ts` also returns this merged usage as `providerUsage` so the CLI can print it after the response.

## Session Ingress Tokens

If the Anthropic API key starts with `sk-ant-si-`, the adapter sends it as a `Bearer` token instead of `x-api-key`.
