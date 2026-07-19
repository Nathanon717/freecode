# src/store/db-types.ts - Shared Store Types

**Role:** The `ModelDataMap` shape, in its own file so `db.ts` and `db-load.ts` can share it without a cycle.

**Read when:** you need the in-memory store's type and want to avoid importing `db.ts`.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
type ModelDataMap = Record<string, ModelEntry>;
```
<!-- END GENERATED EXPORTS -->

## Key Neighbors

- [store/db.md](db.md), [store/db-load.md](db-load.md): both import from here.

## Update Triggers

Update this page when a type is added or removed here.
