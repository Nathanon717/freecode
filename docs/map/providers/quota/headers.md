# src/providers/quota/headers.ts - Groq Rate-Limit Header Parsing

**Role:** Pure parser for Groq `x-ratelimit-*` response headers plus helper to attach static model limit metadata.

## Exports

```typescript
interface GroqRateLimitHeaders {
  limitRequests: number | null;
  limitTokens: number | null;
  remainingRequests: number | null;
  remainingTokens: number | null;
  resetRequestsMs: number | null;
  resetTokensMs: number | null;
  resetRequestsRaw: string | null;
  resetTokensRaw: string | null;
}

interface GroqRateLimitInfo extends GroqRateLimitHeaders {
  modelRpm: number | null;
  modelRpd: number | null;
  modelTpm: number | null;
  modelTpd: number | null;
}

parseGroqDuration(s: string): number | null
parseGroqRateLimitHeaders(headers: Headers | Record<string, string>): GroqRateLimitHeaders
supplementWithModelLimits(headers, modelLimits?): GroqRateLimitInfo
```

## Duration Parsing

`parseGroqDuration()` parses Go `time.Duration`-style strings and returns milliseconds.

| Input | Output |
|-------|--------|
| `2s` | `2000` |
| `13.5s` | `13500` |
| `300ms` | `300` |
| `1m30s` | `90000` |
| `1h30m` | `5400000` |

The whole input must be consumed. Empty or invalid input returns `null`.

## Header Mapping

| Header | Parsed field |
|--------|--------------|
| `x-ratelimit-limit-requests` | `limitRequests` |
| `x-ratelimit-limit-tokens` | `limitTokens` |
| `x-ratelimit-remaining-requests` | `remainingRequests` |
| `x-ratelimit-remaining-tokens` | `remainingTokens` |
| `x-ratelimit-reset-requests` | `resetRequestsRaw`, `resetRequestsMs` |
| `x-ratelimit-reset-tokens` | `resetTokensRaw`, `resetTokensMs` |

## Model Limits

`supplementWithModelLimits()` copies parsed header fields and adds static registry limits as `modelRpm`, `modelRpd`, `modelTpm`, and `modelTpd`, defaulting missing values to `null`.
