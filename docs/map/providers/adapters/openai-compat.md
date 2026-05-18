# src/providers/adapters/openai-compat.ts - OpenAI-Compatible Adapter

**Role:** Creates `@ai-sdk/openai` provider factories for registry providers and Ollama, and captures Groq rate-limit headers.

## Exports

```typescript
getLastCapturedHeaders(providerId: string): GroqRateLimitHeaders | null
createOpenAICompatProvider(providerConfig: ProviderConfig)
createOllamaProvider()
```

## `createOpenAICompatProvider`

Calls `createOpenAI()` with:

- `baseURL` from `providerConfig.baseUrl`
- `apiKey` from `process.env[providerConfig.apiKeyEnvVar]`, then `loadConfig().providers[providerConfig.id]?.apiKey`, then `placeholder`
- optional custom `fetch` for Groq quota capture

## Groq Header Capture

When `DEBUG_QUOTA !== "0"` and `providerConfig.id === "groq"`, a wrapped fetch:

1. Optionally logs request tool schemas when `DEBUG_TOOLS=1`.
2. Calls `globalThis.fetch(input, init)`.
3. Parses `x-ratelimit-*` response headers with `parseGroqRateLimitHeaders()`.
4. Stores the parsed headers in a module-level `Map` keyed by provider ID.

`agent/loop.ts` reads that map after a streamed turn.

## `createOllamaProvider`

Returns an OpenAI-compatible provider pointed at:

```text
http://localhost:11434/v1
```

with API key `ollama`.
