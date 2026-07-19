# src/providers/blocklist-purge.ts - Blocklisted Stored Model Purge

**Role:** Finds stored models that the registry's ID blocklists now exclude, and deletes them and everything referencing them.

Blocklists in `provider-catalog.ts` only ever filter a *live* model list. A model that already earned a `models` row before its id was blocklisted keeps that row — plus its evals, transcripts, call log, and user state — indefinitely. This module is the reconciliation: static config plus the in-memory store, no network, so it works offline and is testable without a fake fetch.

**Read when:** changing what a blocklist means for already-stored data, or adding a blocklist kind.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
interface BlocklistedStoredModel {
  key: string;
  provider: string;
  modelId: string;
  displayName?: string;
}

findBlocklistedStoredModels(): BlocklistedStoredModel[]

purgeBlocklistedStoredModels(models: BlocklistedStoredModel[]): Promise<void>
```
<!-- END GENERATED EXPORTS -->

## Export notes

- `findBlocklistedStoredModels()` reads the in-memory store, so callers must have awaited `ensureStoreReady()` first.
- Only `modelIdBlocklist` (substring) and `modelIdExactBlocklist` are considered. `modelTierBlocklist` matches a tier field that is never stored on the row, so it cannot be re-derived from the DB — do not try to add it here.
- `purgeBlocklistedStoredModels` is irreversible; the only caller gates it behind a user confirmation.

## Key Neighbors

- [store/db.md](../store/db.md): `deleteModelRows` does the FK-ordered delete.
- [providers/provider-catalog.md](provider-catalog.md): owns the blocklists this reads.
- [cli/blocklist-purge-prompt.md](../cli/blocklist-purge-prompt.md): the only caller — startup confirmation.

## Update Triggers

Update this page when a new blocklist field is added to `ProviderConfig`, or when what gets deleted changes.
