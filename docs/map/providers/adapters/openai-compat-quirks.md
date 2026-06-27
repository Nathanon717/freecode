# src/providers/adapters/openai-compat-quirks.ts - OpenAI-Compatible Provider Quirk Profiles

**Role:** Defines the `OpenAICompatQuirks` interface and the `providerQuirks` map. Each entry co-locates one provider's static traits: extra headers, request transforms, rate-limit capture, and error hints. Providers absent from the map get the default path in the adapter skeleton.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface OpenAICompatQuirks {
  staticHeaders?: Record<string, string>;
  transformRequest?: (body: Record<string, unknown>) => { body: Record<string, unknown>; forcedNonStream?: boolean };
  captureRateLimits?: boolean;
  parseRateLimitSnapshot?: (headers: Headers) => RateLimitSnapshot;
  /** Returns a hint string to append after HTTP error details, or null. Called only on non-OK responses. */
  httpErrorHint?: (response: Response) => string | null;
}

providerQuirks: Record<string, OpenAICompatQuirks>
```
<!-- END GENERATED EXPORTS -->

## Adding or Changing a Provider's Quirks

Edit one entry here. The adapter skeleton in [openai-compat](openai-compat.md) reads the profile and runs a fixed pipeline — no `if (id === 'x')` branches anywhere in the skeleton.

## Profiles at a Glance

| Provider   | staticHeaders | transformRequest | captureRateLimits | httpErrorHint |
|------------|:---:|:---:|:---:|:---:|
| openrouter | ✓   |     |     | ✓   |
| mistral    |     | ✓   | ✓   |     |
| cerebras   |     |     | ✓   |     |
| groq       |     |     | ✓   |     |
| openai     |     | ✓   |     |     |

## Key Neighbors

- [openai-compat-request](openai-compat-request.md) — pure transform implementations called by `transformRequest` hooks
- [openai-compat](openai-compat.md) — consumer: reads `providerQuirks[id]` and runs the fixed pipeline
- [quota/headers](../quota/headers.md) — `parseRateLimitSnapshot` implementations
