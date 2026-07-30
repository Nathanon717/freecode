# src/providers/quota/headers.ts - Provider Rate-Limit Header Parsing

**Role:** Pure parsers for Groq, Mistral, and Cerebras rate-limit response headers; plus extractors that derive per-model limit ceilings for persistence in `models.json`. Anthropic has no quirk profile entry (see [openai-compat-quirks.md](../adapters/openai-compat-quirks.md)), so `captureRateLimits` is off for it and none of these parsers run against it.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface GroqRateLimitHeaders {
  limitRequests: number | null;
  limitTokens: number | null;
  remainingRequests: number | null;
  remainingTokens: number | null;
  /** Parsed reset-requests duration in milliseconds. */
  resetRequestsMs: number | null;
  /** Parsed reset-tokens duration in milliseconds. */
  resetTokensMs: number | null;
  /** Raw reset-requests string as returned by the server, e.g. "2s". */
  resetRequestsRaw: string | null;
  /** Raw reset-tokens string as returned by the server, e.g. "1s". */
  resetTokensRaw: string | null;
}

interface GroqRateLimitInfo extends GroqRateLimitHeaders {
  modelRpm: number | null;
  modelRpd: number | null;
  modelTpm: number | null;
  modelTpd: number | null;
}

parseGroqDuration(s: string): number | null

parseGroqRateLimitHeaders(headers: Record<string, string> | Headers): GroqRateLimitHeaders

supplementWithModelLimits(headers: GroqRateLimitHeaders, modelLimits?: { rpm: number; rpd: number; tpm: number; tpd: number | null; } | undefined): GroqRateLimitInfo

interface RateLimitBucket {
  label: string;
  remaining: number | null;
  limit: number | null;
  /** ms until bucket refills — present when the provider returns a reset header. */
  resetMs?: number | null;
}

type RateLimitSnapshot = RateLimitBucket[];

groqHeadersToSnapshot(h: GroqRateLimitHeaders): RateLimitSnapshot

parseMistralRateLimitSnapshot(headers: Record<string, string> | Headers): RateLimitSnapshot

parseCerebrasRateLimitSnapshot(headers: Record<string, string> | Headers): RateLimitSnapshot

extractGroqRateLimitBuckets(h: GroqRateLimitHeaders): Record<string, ObservedRateLimitBucket>

extractMistralRateLimitBuckets(headers: Record<string, string> | Headers): Record<string, ObservedRateLimitBucket>

extractCerebrasRateLimitBuckets(headers: Record<string, string> | Headers): Record<string, ObservedRateLimitBucket>

extractOpenAICompatRateLimitBuckets(providerId: string, headers: Headers): Record<string, ObservedRateLimitBucket>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `ObservedRateLimitBucket` = `{ limit: number; intervalMs: number | null }`. `intervalMs` is fixed for Mistral/Cerebras (60k/3.6M/86.4M ms) and the dynamic reset-window for Groq/OpenAI.
- `extractOpenAICompatRateLimitBuckets` acts as a dispatcher: routes to mistral/cerebras/groq extractors by `providerId`.
- Snapshot parsers (`parse*`, `groqHeadersToSnapshot`) return live remaining/limit data for UI display; `extract*Buckets` functions return limit-ceiling data for persistence in `models.json`.

## Read When

- Debugging quota display or provider response headers.
- Adding provider-specific rate-limit parsing.
- Changing how static registry limits supplement live quota headers.

## Key Neighbors

- [providers/provider-registry.md](../provider-registry.md): static model limits.
- [providers/adapters/openai-compat.md](../adapters/openai-compat.md): captured OpenAI-compatible headers (Anthropic included).
- [agent/loop.md](../../agent/loop.md): attaches quota metadata to turn results.

## Update Triggers

Update this page when exported parser names, quota ownership, or key consumers change. Keep detailed header mappings in source tests or generated references, not in this map page.
