# src/providers/adapters/adapter-usage-capture.ts - Shared Usage/Header Capture

**Role:** Capture infrastructure shared by the OpenAI-compatible and Anthropic adapters. Both keep a per-provider store of the latest rate-limit header snapshot and accumulate per-turn usage-capture promises; only the payload shape differs, so the stores are generic.

## Exports

```typescript
class HeaderSnapshotStore {
  set(providerId: string, snapshot: RateLimitSnapshot): void
  get(providerId: string): RateLimitSnapshot | null
}
class UsageCaptureStore<T> {
  begin(providerId: string): void
  push(providerId: string, capture: Promise<T | null>): void
  end(providerId: string): Promise<T[]>
}
```

## `HeaderSnapshotStore`

Per-provider store of the most-recently captured rate-limit header snapshot. Written by the adapters' wrapped fetch; read by `agent/loop.ts` after a streamed turn.

## `UsageCaptureStore<T>`

Per-provider accumulator of in-flight usage-capture promises. `begin()` opens a session; `push()` enqueues a capture (dropped if no session is open, and capture errors resolve to `null`); `end()` awaits all captures and returns the non-null results. The OpenAI-compatible adapter uses `T = CapturedProviderUsage` and returns the array; the Anthropic adapter uses `T = AnthropicTokenUsage` and merges the array via `mergeAnthropicUsages`.

## Read When

Changing how either adapter accumulates per-turn usage, or adding a third adapter that needs the same begin/end capture or header-snapshot pattern.
