# src/providers/quota/headers.ts - Provider Rate-Limit Header Parsing

**Role:** Pure parser for Groq and Anthropic rate-limit response headers plus helper to attach static model limit metadata.

## Exports

```typescript
parseGroqDuration(s: string): number | null
parseGroqRateLimitHeaders(headers: Headers | Record<string, string>): GroqRateLimitHeaders
parseAnthropicRateLimitHeaders(headers: Headers | Record<string, string>): GroqRateLimitHeaders
parseAnthropicExtendedHeaders(headers: Headers | Record<string, string>): AnthropicExtendedHeaders
supplementWithModelLimits(headers, modelLimits?): GroqRateLimitInfo
```

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
