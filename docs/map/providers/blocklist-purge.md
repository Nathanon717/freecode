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
- `modelIdBlocklist` (substring), `modelIdExactBlocklist`, and the per-user blocklist are all considered; the user list matches on the whole `provider:modelId` key. Including it is what makes hand-editing `blocklist.json` purge the matching rows on the next launch. `modelTierBlocklist` matches a tier field that is never stored on the row, so it cannot be re-derived from the DB — do not try to add it here.
- `purgeBlocklistedStoredModels` is irreversible; both callers gate it behind a user confirmation.

## Key Neighbors

- [store/db.md](../store/db.md): `deleteModelRows` does the FK-ordered delete.
- [providers/provider-catalog.md](provider-catalog.md): owns the shipped blocklists this reads.
- [providers/user-blocklist.md](user-blocklist.md): owns the per-user blocklist this also reads.
- [cli/blocklist-purge-prompt.md](../cli/blocklist-purge-prompt.md): startup confirmation, the whole-store caller.
- [commands/model.md](../commands/model.md): the picker's Remove Fully action, which purges one already-known model and so skips `findBlocklistedStoredModels`.

## Update Triggers

Update this page when a new blocklist field is added to `ProviderConfig`, or when what gets deleted changes.
