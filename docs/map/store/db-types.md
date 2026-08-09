# src/store/db-types.ts - Shared Store Types

**Role:** The `ModelDataMap` shape, in its own file so `db.ts` and `db-load.ts` can share it without a cycle.

**Read when:** you need the in-memory store's type and want to avoid importing `db.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
/**
 * The in-memory model store: every `"provider:modelId"` key to its entry.
 */
type ModelDataMap = Record<string, ModelEntry>;
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/model-data.ts`](../providers/model-data.md) ×1
- **Imported by:** [`store/db.ts`](db.md) ×3, [`store/db-load.ts`](db-load.md) ×2

## Tests

No mirrored test — pure type declarations; erased at compile time, no runtime behavior to test.

## Budget

5 / 500 lines (495 to spare).
<!-- END GENERATED MAP FACTS -->

## Key Neighbors

- [store/db.md](db.md), [store/db-load.md](db-load.md): both import from here.

## Update Triggers

Update this page when a type is added or removed here.
