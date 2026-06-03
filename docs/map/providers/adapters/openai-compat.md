# src/providers/adapters/openai-compat.ts - OpenAI-Compatible Adapter

**Role:** Creates `@ai-sdk/openai` provider factories for registry providers and Ollama, captures rate-limit headers, auto-retries short 429 waits, and captures raw usage metadata from OpenAI-compatible responses.

## Exports

```typescript
getLastCapturedHeaders(providerId: string): GroqRateLimitHeaders | null
beginProviderUsageCapture(providerId: string): void
endProviderUsageCapture(providerId: string): Promise<CapturedProviderUsage[]>
formatCapturedProviderUsages(usages): string | null
formatOpenAICompatHttpError(providerName, response): Promise<string | null>
getOpenAICompatProviderHeaders(providerId: string): Record<string, string> | undefined
normalizeOpenAICompatToolCallSse(body: string): string
openAIModelDisallowsTemperature(modelId: string): boolean
createOpenAICompatProvider(providerConfig: ProviderConfig)
createOllamaProvider()
```

## `createOpenAICompatProvider`

Calls `createOpenAI()` with:

- `baseURL` from `providerConfig.baseUrl`
- `apiKey` from `process.env[providerConfig.apiKeyEnvVar]`, then `loadConfig().providers[providerConfig.id]?.apiKey`, then `placeholder`
- `headers` from `getOpenAICompatProviderHeaders()`, currently OpenRouter `HTTP-Referer` and `X-Title`
- optional custom `fetch` for quota capture, OpenAI temperature stripping, raw usage capture, or provider HTTP error formatting

For direct OpenAI requests, the custom fetch removes `temperature` from models matched by `openAIModelDisallowsTemperature()` because those models only accept OpenAI's default temperature.

Non-OK HTTP responses are parsed for OpenAI-compatible `{ error: { message, code } }` bodies before throwing so callers see provider-specific API key, credit, model, or rate-limit details instead of a generic SDK error.

For streaming responses, the custom fetch normalizes tool-call SSE chunks by adding a missing `type: "function"` on `delta.tool_calls[]` entries so the OpenAI SDK stream parser accepts otherwise-compatible function-call deltas from providers such as Mistral and LLM7.

## 429 Auto-Retry

When any provider returns HTTP 429 with a `retry-after` header, and the delay is ≤ `config.retryMaxWaitSeconds` (default 10), the custom fetch retries automatically (up to 5 attempts). If the delay exceeds the threshold, the error is thrown immediately. Set `retryMaxWaitSeconds: 0` in config to disable retries.

During the wait, if a retry banner sink has been registered via `registerRetryBannerSink()`, the countdown appears in the TUI footer (driven by `terminal-ui`'s 1s refresh — no separate timer needed). Otherwise (non-TTY / scripted mode), a `\r`-based live countdown is written to stdout. `registerRetryBannerSink` is called from `src/index.ts` when `process.stdin.isTTY` is true.

## Rate-Limit Header Capture

When `DEBUG_QUOTA !== "0"`, a wrapped fetch parses `x-ratelimit-*` headers for Groq, Mistral, and Cerebras and stores them in a module-level `Map` keyed by provider ID. `agent/loop.ts` reads that map after a streamed turn.

## Usage Capture

For OpenAI-compatible providers, the wrapped fetch clones responses while an agent turn is inside `beginProviderUsageCapture()` / `endProviderUsageCapture()`.

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
