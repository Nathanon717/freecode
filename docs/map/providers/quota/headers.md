# src/providers/quota/headers.ts - Provider Rate-Limit Header Parsing

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Pure parsers for Groq, Mistral, and Cerebras rate-limit response headers; plus extractors that derive per-model limit ceilings for persistence in `models.json`. Anthropic has no quirk profile entry (see [openai-compat-quirks.md](../adapters/openai-compat-quirks.md)), so `captureRateLimits` is off for it and none of these parsers run against it.

## Read When

- Debugging quota display or provider response headers.
- Adding provider-specific rate-limit parsing.
- Changing how static registry limits supplement live quota headers.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Pure parser for Groq rate-limit response headers.
 *
 * Groq returns standard x-ratelimit-* headers on every response:
 *   x-ratelimit-limit-requests:     30
 *   x-ratelimit-limit-tokens:       6000
 *   x-ratelimit-remaining-requests: 29
 *   x-ratelimit-remaining-tokens:   5970
 *   x-ratelimit-reset-requests:     2s
 *   x-ratelimit-reset-tokens:       1s
 *
 * Reset values use Go's time.Duration string format:
 *   "300ms", "1.5s", "2s", "1m30s", "5m", "1h30m"
 */
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

/**
 * Parse a Go time.Duration string into milliseconds.
 *
 * Supported units: h (hours), m (minutes), s (seconds, may be fractional), ms (milliseconds).
 * Examples: "2s" → 2000, "13.5s" → 13500, "1m30s" → 90000, "300ms" → 300, "1h30m" → 5400000.
 *
 * Returns null if the string is empty or cannot be parsed.
 */
parseGroqDuration(s: string): number | null

/**
 * Extract and parse Groq rate-limit headers from a fetch Response Headers object
 * or a plain string record.
 */
parseGroqRateLimitHeaders(headers: Record<string, string> | Headers): GroqRateLimitHeaders

supplementWithModelLimits(headers: GroqRateLimitHeaders, modelLimits?: { rpm: number; rpd: number; tpm: number; tpd: number | null; } | undefined): GroqRateLimitInfo

/**
 * A single rate-limit bucket: remaining and limit counts, with an optional
 * reset duration (ms) for time-based estimation.
 */
interface RateLimitBucket {
  label: string;
  remaining: number | null;
  limit: number | null;
  /** ms until bucket refills — present when the provider returns a reset header. */
  resetMs?: number | null;
}

/**
 * Normalised rate-limit state for any provider, as an ordered list of buckets.
 */
type RateLimitSnapshot = RateLimitBucket[];

/**
 * Convert the Groq-specific header struct into the generic snapshot format.
 */
groqHeadersToSnapshot(h: GroqRateLimitHeaders): RateLimitSnapshot

/**
 * Parse Mistral minute-level rate-limit headers into a snapshot.
 * Headers: x-ratelimit-{limit,remaining}-{req,tokens}-minute
 */
parseMistralRateLimitSnapshot(headers: Record<string, string> | Headers): RateLimitSnapshot

/**
 * Parse Cerebras per-minute/hour/day rate-limit headers into a snapshot.
 * Headers: x-ratelimit-{limit,remaining}-{requests,tokens}-{minute,hour,day}
 */
parseCerebrasRateLimitSnapshot(headers: Record<string, string> | Headers): RateLimitSnapshot

/**
 * Extract rate-limit ceiling values from Groq/OpenAI-compat headers (dynamic reset window).
 */
extractGroqRateLimitBuckets(h: GroqRateLimitHeaders): Record<string, ObservedRateLimitBucket>

/**
 * Extract rate-limit ceiling values from Mistral per-minute headers.
 */
extractMistralRateLimitBuckets(headers: Record<string, string> | Headers): Record<string, ObservedRateLimitBucket>

/**
 * Extract rate-limit ceiling values from Cerebras per-minute/hour/day headers.
 */
extractCerebrasRateLimitBuckets(headers: Record<string, string> | Headers): Record<string, ObservedRateLimitBucket>

/**
 * Dispatch rate-limit bucket extraction by provider.
 * Covers groq, mistral, cerebras, and OpenAI-compat providers sharing the Groq header shape.
 */
extractOpenAICompatRateLimitBuckets(providerId: string, headers: Headers): Record<string, ObservedRateLimitBucket>
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/model-data.ts`](../model-data.md) ×7
- **Imported by:** [`providers/adapters/openai-compat-quirks.ts`](../adapters/openai-compat-quirks.md) ×5, [`agent/loop.ts`](../../agent/loop.md) ×3, [`providers/adapters/adapter-usage-capture.ts`](../adapters/adapter-usage-capture.md) ×3, [`providers/adapters/openai-compat.ts`](../adapters/openai-compat.md) ×3, [`providers/quota/cache.ts`](cache.md) ×3, [`agent/usage-finalize.ts`](../../agent/usage-finalize.md) ×2, [`cli/chrome/footer-status.ts`](../../cli/chrome/footer-status.md) ×2

## Tests

`tests/providers/quota/headers.test.ts`. 1 other test file references it.

## Budget

249 / 500 lines (251 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- `ObservedRateLimitBucket` = `{ limit: number; intervalMs: number | null }`. `intervalMs` is fixed for Mistral/Cerebras (60k/3.6M/86.4M ms) and the dynamic reset-window for Groq/OpenAI.
- `extractOpenAICompatRateLimitBuckets` acts as a dispatcher: routes to mistral/cerebras/groq extractors by `providerId`.
- Snapshot parsers (`parse*`, `groqHeadersToSnapshot`) return live remaining/limit data for UI display; `extract*Buckets` functions return limit-ceiling data for persistence in `models.json`.

## Key Neighbors

- [providers/provider-registry.md](../provider-registry.md): static model limits.
- [providers/adapters/openai-compat.md](../adapters/openai-compat.md): captured OpenAI-compatible headers (Anthropic included).
- [agent/loop.md](../../agent/loop.md): attaches quota metadata to turn results.

## Update Triggers

Update this page when exported parser names, quota ownership, or key consumers change. Keep detailed header mappings in source tests or generated references, not in this map page.
