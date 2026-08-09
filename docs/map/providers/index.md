# src/providers/index.ts - Provider Re-exports

**Role:** Barrel file for the providers subsystem.

<!-- BEGIN GENERATED EXPORTS -->
## Exports

```typescript
export * from './types.js'

export * from './provider-registry.js'
```
<!-- END GENERATED EXPORTS -->

<!-- BEGIN GENERATED MAP FACTS -->
## Neighbors

- **Imports:** [`providers/provider-registry.ts`](provider-registry.md) ×8, [`providers/types.ts`](types.md) ×5

## Tests

No mirrored test — pure barrel; only re-exports, no logic of its own.

## Budget

3 / 500 lines (497 to spare).
<!-- END GENERATED MAP FACTS -->

## Note

Most internal provider modules import direct dependencies instead of this barrel to keep dependency edges explicit.
