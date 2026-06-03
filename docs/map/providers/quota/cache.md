# src/providers/quota/cache.ts - Quota Cache

**Role:** Persists the most-recently seen `RateLimitSnapshot` per provider to disk so the footer can show stale quota data on app start or immediately after `/model` switch, before any inference call.

## Exports

```typescript
loadCachedQuota(providerId: string): { snapshot: RateLimitSnapshot; savedAt: number } | null
saveQuotaToCache(providerId: string, snapshot: RateLimitSnapshot): void
```

## Storage

Written to `~/.config/freecode/quota-cache.json` (one entry per `providerId`). Reads/writes are synchronous and best-effort; errors are silently swallowed.

## Read When

- Understanding how footer quota data is seeded on startup.
- Changing where/how quota snapshots are persisted between sessions.
