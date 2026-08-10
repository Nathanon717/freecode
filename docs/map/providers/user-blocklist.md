# src/providers/user-blocklist.ts - Per-User Model Blocklist

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Reads and writes `$FREECODE_HOME/blocklist.json`, the flat list of `provider:modelId` keys this machine's user never wants offered.

## Read When

changing where the user blocklist is stored, what it applies to, or how a malformed file is tolerated.
<!-- END GENERATED MAP INTENT -->

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Keys (`provider:modelId`) the user has permanently blocklisted.
 *
 * Cached in memory after the first read. Reads are lenient by design: a
 * hand-edited file keeps its well-formed entries and drops the rest, and an
 * unparseable file reads as empty rather than throwing — a blocklist that fails
 * to load must never break startup.
 */
getUserBlocklist(): Set<string>

/**
 * True if `provider:modelId` is on the user blocklist. Matching is on the whole
 * key, never a substring — unlike `modelIdBlocklist`.
 */
isUserBlocklisted(providerId: string, modelId: string): boolean

/**
 * Add a key to the blocklist and persist it. No-op if already present. Writes are
 * sorted and pretty-printed, to keep the file readable and diff-stable.
 */
addToUserBlocklist(key: string): void

/**
 * Drop the in-memory copy so the next read re-reads the file. Tests only.
 */
resetUserBlocklistCache(): void
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`logger.ts`](../logger.md) ×2, [`config/index.ts`](../config/index.md) ×1
- **Imported by:** [`providers/provider-registry.ts`](provider-registry.md) ×3

## Tests

`tests/providers/user-blocklist.test.ts`. 1 other test file references it.

## Budget

81 / 500 lines (419 to spare).
<!-- END GENERATED MAP FACTS -->

## Notes

Deliberately separate from the `modelIdBlocklist` / `modelIdExactBlocklist` arrays in `provider-catalog.ts`. Those are shipped, hand-curated defaults meaning "this model is broken for everyone" and live in checked-in source; this file is the personal counterpart, written at runtime by the `/model` picker's **Remove Fully** action. Keeping them apart is what stops a user's private removals from landing in the repo's catalog — do not merge the two.

The file is a bare JSON array and nothing else, so it doubles as the viewing/editing UI: there is no dedicated screen for it, and hand-editing is a supported workflow.
