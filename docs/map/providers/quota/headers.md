# src/providers/quota/headers.ts - Provider Rate-Limit Header Parsing

**Role:** Pure parsers for Groq, Anthropic, Mistral, and Cerebras rate-limit response headers; plus extractors that derive per-model limit ceilings for persistence in `models.json`.

## Exports

```typescript
// Snapshot parsers (live remaining/limit for UI display)
parseGroqDuration(s: string): number | null
parseGroqRateLimitHeaders(headers): GroqRateLimitHeaders
parseAnthropicRateLimitHeaders(headers): GroqRateLimitHeaders
parseAnthropicExtendedHeaders(headers): AnthropicExtendedHeaders
parseMistralRateLimitSnapshot(headers): RateLimitSnapshot
parseCerebrasRateLimitSnapshot(headers): RateLimitSnapshot
supplementWithModelLimits(headers, modelLimits?): GroqRateLimitInfo
groqHeadersToSnapshot(h): RateLimitSnapshot

// Limit-ceiling extractors (for saving to models.json)
extractGroqRateLimitBuckets(h: GroqRateLimitHeaders): Record<string, ObservedRateLimitBucket>
extractMistralRateLimitBuckets(headers): Record<string, ObservedRateLimitBucket>
extractCerebrasRateLimitBuckets(headers): Record<string, ObservedRateLimitBucket>
extractAnthropicRateLimitBuckets(base, extended): Record<string, ObservedRateLimitBucket>
extractOpenAICompatRateLimitBuckets(providerId, headers): Record<string, ObservedRateLimitBucket>
  // dispatcher: routes to mistral/cerebras/groq extractors by providerId
```

`ObservedRateLimitBucket` = `{ limit: number; intervalMs: number | null }`. `intervalMs` is fixed for Mistral/Cerebras (60k/3.6M/86.4M ms), 60000 for Anthropic, and the dynamic reset-window for Groq/OpenAI.

## Read When

- Debugging quota display or provider response headers.
- Adding provider-specific rate-limit parsing.
- Changing how static registry limits supplement live quota headers.

## Key Neighbors

- [providers/registry.md](../registry.md): static model limits.
- [providers/adapters/openai-compat.md](../adapters/openai-compat.md): captured OpenAI-compatible headers.
- [providers/adapters/anthropic.md](../adapters/anthropic.md): captured Anthropic headers.
- [agent/loop.md](../../agent/loop.md): attaches quota metadata to turn results.

## Update Triggers

Update this page when exported parser names, quota ownership, or key consumers change. Keep detailed header mappings in source tests or generated references, not in this map page.
