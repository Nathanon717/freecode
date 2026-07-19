# src/providers/user-blocklist.ts - Per-User Model Blocklist

**Role:** Reads and writes `$FREECODE_HOME/blocklist.json`, the flat list of `provider:modelId` keys this machine's user never wants offered.

Deliberately separate from the `modelIdBlocklist` / `modelIdExactBlocklist` arrays in `provider-catalog.ts`. Those are shipped, hand-curated defaults meaning "this model is broken for everyone" and live in checked-in source; this file is the personal counterpart, written at runtime by the `/model` picker's **Remove Fully** action. Keeping them apart is what stops a user's private removals from landing in the repo's catalog — do not merge the two.

The file is a bare JSON array and nothing else, so it doubles as the viewing/editing UI: there is no dedicated screen for it, and hand-editing is a supported workflow.

**Read when:** changing where the user blocklist is stored, what it applies to, or how a malformed file is tolerated.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
getUserBlocklist(): Set<string>

isUserBlocklisted(providerId: string, modelId: string): boolean

addToUserBlocklist(key: string): void

resetUserBlocklistCache(): void
```
<!-- END GENERATED EXPORTS -->

## Export notes

- The parsed list is cached in-memory after the first read; `resetUserBlocklistCache()` exists for tests, which point `$FREECODE_HOME` at a temp dir per case.
- Reads are lenient by design: a hand-edited file keeps its well-formed entries and drops the rest, and an unparseable file reads as empty rather than throwing. A blocklist that fails to load must never break startup.
- Writes are sorted and pretty-printed to keep the file readable and diff-stable.
- Matching is on the whole `provider:modelId` key — never a substring, unlike `modelIdBlocklist`.

## Key Neighbors

- [providers/provider-registry.md](provider-registry.md): applies the list in `_doInit` (before any catalog write) and owns `blocklistModelPermanently`, the runtime add-plus-strip entry point.
- [providers/blocklist-purge.md](blocklist-purge.md): folds this list into `findBlocklistedStoredModels`, so hand-editing the file purges matching rows on the next launch.
- [commands/model.md](../commands/model.md): the picker's Remove Fully action is the only writer.
- [config/index.md](../config/index.md): `getConfigDir()` decides where the file lives.

## Update Triggers

Update this page when the file format or location changes, or when a new call site starts consulting the user blocklist.
