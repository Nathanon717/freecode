# src/providers/adapters/openai-compat.ts - OpenAI-Compatible Adapter

**Role:** Creates `@ai-sdk/openai` provider factories for registry providers and Ollama, captures Groq rate-limit headers, and captures raw usage metadata from OpenAI-compatible responses.

## Exports

```typescript
getLastCapturedHeaders(providerId: string): GroqRateLimitHeaders | null
beginProviderUsageCapture(providerId: string): void
endProviderUsageCapture(providerId: string): Promise<CapturedProviderUsage[]>
formatCapturedProviderUsages(usages): string | null
formatOpenAICompatHttpError(providerName, response): Promise<string | null>
getOpenAICompatProviderHeaders(providerId: string): Record<string, string> | undefined
normalizeMistralToolCallSse(body: string): string
openAIModelDisallowsTemperature(modelId: string): boolean
createOpenAICompatProvider(providerConfig: ProviderConfig)
createOllamaProvider()
```

## `createOpenAICompatProvider`

Calls `createOpenAI()` with:

- `baseURL` from `providerConfig.baseUrl`
- `apiKey` from `process.env[providerConfig.apiKeyEnvVar]`, then `loadConfig().providers[providerConfig.id]?.apiKey`, then `placeholder`
- `headers` from `getOpenAICompatProviderHeaders()`, currently OpenRouter `HTTP-Referer` and `X-Title`
- optional custom `fetch` for Groq quota capture, OpenAI temperature stripping, raw usage capture, or provider HTTP error formatting

For direct OpenAI requests, the custom fetch removes `temperature` from models matched by `openAIModelDisallowsTemperature()` because those models only accept OpenAI's default temperature.

Non-OK HTTP responses are parsed for OpenAI-compatible `{ error: { message, code } }` bodies before throwing so callers see provider-specific API key, credit, model, or rate-limit details instead of a generic SDK error.

For direct Mistral streaming responses, the custom fetch normalizes tool-call SSE chunks by adding a missing `type: "function"` on `delta.tool_calls[]` entries so the OpenAI SDK stream parser accepts Mistral's otherwise-compatible function-call deltas.

## Groq Header Capture

When `DEBUG_QUOTA !== "0"` and `providerConfig.id === "groq"`, a wrapped fetch:

1. Optionally logs request tool schemas when `DEBUG_TOOLS=1`.
2. Calls `globalThis.fetch(input, init)`.
3. Parses `x-ratelimit-*` response headers with `parseGroqRateLimitHeaders()`.
4. Stores the parsed headers in a module-level `Map` keyed by provider ID.

`agent/loop.ts` reads that map after a streamed turn.

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
