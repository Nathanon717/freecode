# src/providers/quota/cache.ts - Quota Cache

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Persists the most-recently seen `RateLimitSnapshot` per provider to disk so the footer can show stale quota data on app start or immediately after `/model` switch, before any inference call.

## Read When

- Understanding how footer quota data is seeded on startup.
- Changing where/how quota snapshots are persisted between sessions.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
loadCachedQuota(providerId: string): { snapshot: RateLimitSnapshot; savedAt: number; } | null

saveQuotaToCache(providerId: string, snapshot: RateLimitSnapshot): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/quota/headers.ts`](headers.md) ×3, [`config/index.ts`](../../config/index.md) ×2
- **Imported by:** [`cli/session-modes.ts`](../../cli/session-modes.md) ×2

## Tests

`tests/providers/quota/cache.test.ts`. 1 other test file references it.

## Budget

38 / 500 lines (462 to spare).
<!-- END GENERATED MAP FACTS -->

## Storage

Written to `~/.config/freecode/quota-cache.json` (one entry per `providerId`). Reads/writes are synchronous and best-effort; errors are silently swallowed.
