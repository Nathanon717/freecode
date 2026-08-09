# src/providers/user-blocklist.ts - Per-User Model Blocklist

<!-- BEGIN GENERATED MAP INTENT -->
## Role

Reads and writes `$FREECODE_HOME/blocklist.json`, the flat list of `provider:modelId` keys this machine's user never wants offered.

## Read When

changing where the user blocklist is stored, what it applies to, or how a malformed file is tolerated.
<!-- END GENERATED MAP INTENT -->

Deliberately separate from the `modelIdBlocklist` / `modelIdExactBlocklist` arrays in `provider-catalog.ts`. Those are shipped, hand-curated defaults meaning "this model is broken for everyone" and live in checked-in source; this file is the personal counterpart, written at runtime by the `/model` picker's **Remove Fully** action. Keeping them apart is what stops a user's private removals from landing in the repo's catalog — do not merge the two.

The file is a bare JSON array and nothing else, so it doubles as the viewing/editing UI: there is no dedicated screen for it, and hand-editing is a supported workflow.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * Keys (`provider:modelId`) the user has permanently blocklisted.
 */
getUserBlocklist(): Set<string>

/**
 * True if `provider:modelId` is on the user blocklist.
 */
isUserBlocklisted(providerId: string, modelId: string): boolean

/**
 * Add a key to the blocklist and persist it. No-op if already present.
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

68 / 500 lines (432 to spare).
<!-- END GENERATED MAP FACTS -->

## Export notes

- The parsed list is cached in-memory after the first read; `resetUserBlocklistCache()` exists for tests, which point `$FREECODE_HOME` at a temp dir per case.
- Reads are lenient by design: a hand-edited file keeps its well-formed entries and drops the rest, and an unparseable file reads as empty rather than throwing. A blocklist that fails to load must never break startup.
- Writes are sorted and pretty-printed to keep the file readable and diff-stable.
- Matching is on the whole `provider:modelId` key — never a substring, unlike `modelIdBlocklist`.

## Key Neighbors

- [providers/provider-registry.md](provider-registry.md): applies the list in `_doInit` (before any catalog write) and owns `blocklistModelPermanently`, the runtime add-plus-strip entry point.
- [commands/model.md](../commands/model.md): the picker's Remove Fully action is the only writer.
- [config/index.md](../config/index.md): `getConfigDir()` decides where the file lives.

## Update Triggers

Update this page when the file format or location changes, or when a new call site starts consulting the user blocklist.
