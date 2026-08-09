# src/providers/adapters/adapter-usage-capture.ts - Shared Usage/Header Capture

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Capture infrastructure used by the OpenAI-compatible adapter (the only adapter — Anthropic routes through it too). Keeps a per-provider store of the latest rate-limit header snapshot and accumulates per-turn usage-capture promises. The stores are generic (`T` is a type param) even though only one caller remains, in case a second adapter shows up.

## Read When

Changing how the adapter accumulates per-turn usage, or adding a second adapter that needs the same begin/end capture or header-snapshot pattern.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Per-provider store of the most-recently captured rate-limit header snapshot.
 */
class HeaderSnapshotStore {
  private snapshots;
  set(providerId: string, snapshot: RateLimitSnapshot): void;
  get(providerId: string): RateLimitSnapshot | null;
}

/**
 * Per-provider accumulator of in-flight usage-capture promises. A capture
 * session is opened with begin() and drained with end(); pushes that happen
 * outside an open session are dropped. Capture errors resolve to null and are
 * filtered out by end().
 */
class UsageCaptureStore<T> {
  private sessions;
  begin(providerId: string): void;
  push(providerId: string, capture: Promise<T | null>): void;
  end(providerId: string): Promise<T[]>;
}
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/quota/headers.ts`](../quota/headers.md) ×3
- **Imported by:** [`providers/adapters/openai-compat.ts`](openai-compat.md) ×2

## Tests

`tests/providers/adapters/adapter-usage-capture.test.ts`.

## Budget

51 / 500 lines (449 to spare).
<!-- END GENERATED MAP FACTS -->

## `HeaderSnapshotStore`

Per-provider store of the most-recently captured rate-limit header snapshot. Written by the adapters' wrapped fetch; read by `agent/loop.ts` after a streamed turn.

## `UsageCaptureStore<T>`

Per-provider accumulator of in-flight usage-capture promises. `begin()` opens a session; `push()` enqueues a capture (dropped if no session is open, and capture errors resolve to `null`); `end()` awaits all captures and returns the non-null results. The OpenAI-compatible adapter uses `T = CapturedProviderUsage` and returns the array as-is.
